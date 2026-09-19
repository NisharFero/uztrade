import assert from "node:assert/strict";
import test from "node:test";
import { PROCEDURES, PROCEDURE_IDS } from "../../../modules/procedures/sync";
import { classify, classifyByRules, settleMatch } from "../../../modules/intake/classify";

const settle = (q: string, followUps = 0) => settleMatch(classifyByRules(q), q, { followUps });

test("near-duplicate procedures resolve through the commodity table", () => {
  assert.equal(settle("export 20 tonnes of grapes by train").procedureId, "325");
  assert.equal(settle("export 20 tonnes of raisins by train").procedureId, "306");
  assert.equal(settle("export dried apricots by train").procedureId, "306");
  assert.equal(settle("export fresh apricots by train").procedureId, "325");
  assert.equal(settle("I want to export fresh tomatoes from Uzbekistan to Kazakhstan by train.").procedureId, "325");
  assert.equal(settle("import tea by train").procedureId, "477");
  assert.equal(settle("export tea by air").procedureId, "540");
});

test("asks only for the missing dimension", () => {
  const apricots = settle("export apricots by train");
  assert.equal(apricots.status, "clarify");
  assert.equal(apricots.missing, "commodity");
  assert.deepEqual(apricots.clarify?.options.map((o) => o.label), ["Fresh apricots", "Dried apricots"]);
  assert.equal(settle(apricots.clarify!.options[1].query).procedureId, "306");

  assert.equal(settle("I need to export something by train").missing, "commodity");
  assert.equal(settle("I want to move tea by train").missing, "direction");
  assert.equal(settle("export tea to russia").missing, "mode");
});

test("after two follow-ups it offers candidate procedures by title instead of asking again", () => {
  const r = settle("I want to move tea", 2);
  assert.equal(r.status, "clarify");
  assert.ok(r.candidates && r.candidates.length >= 2 && r.candidates.length <= 3);
  for (const c of r.candidates!) assert.match(c.title, /tea/i);
  for (const option of r.clarify!.options) {
    const chosen = settle(option.query).procedureId;
    assert.ok(chosen && (PROCEDURE_IDS as readonly string[]).includes(chosen), option.query);
  }
});

test("declines small talk and unsupported goods by name", () => {
  const weather = settle("what is the weather like today");
  assert.equal(weather.status, "declined");
  assert.equal(weather.clarify, undefined);

  const cotton = settle("export cotton by train");
  assert.equal(cotton.status, "declined");
  assert.match(cotton.reason, /cotton/);
});

test("the classifier's procedure pick loses to the commodity table", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        procedureId: "306",
        confidence: 0.9,
        reason: "Dried fruit by rail.",
        shipment: { goods: "grapes", quantity: 20, unit: "tonnes", origin: null, destination: null, mode: "train" },
      }) } }],
    }));
  try {
    const m = await classify("export 20 tonnes of grapes by train", "test-key");
    assert.equal(m.procedureId, "325");
    assert.ok(m.rationale.some((r) => /table decides/.test(r)));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a resolved query carries the step plan to follow", () => {
  const m = settle("export 20 tonnes of tomatoes from Tashkent to Almaty by train");
  assert.equal(m.status, "resolved");
  assert.equal(m.slots.destinationCountry, "Kazakhstan");
  assert.equal(m.slots.hs, "0702");

  const plan = m.plan!;
  assert.equal(plan.totalSteps, 48);
  assert.equal(plan.tracks.length, 10);
  assert.equal(plan.tracks.flatMap((t) => t.steps).length, 48);
  assert.ok(plan.startNow.length >= 2);
  for (const a of plan.startNow)
    for (const b of plan.startNow) if (a !== b) assert.ok(plan.tracks.find((t) => t.blockId === a)!.parallelWith.includes(b));
  // Decisions come from the source's own flags (325 marks steps 27 and 31 as the alternative pair).
  const alt = PROCEDURES["325"].blocks.find((b) => b.altSteps.length)!;
  assert.ok(plan.decisions.some((d) => d.kind === "alternative" && d.blockId === alt.id && d.steps.join() === alt.altSteps.join()));
  assert.ok(plan.decisions.some((d) => d.kind === "optional" && d.steps[0] === 44), "red-corridor inspection is a decision, not a certainty");

  const declaration = plan.tracks.flatMap((t) => t.steps).find((s) => s.num === 41)!;
  assert.equal(declaration.lane, "agent");
  assert.ok(declaration.needs.common.some((i) => i.producedBy?.stepNum === 40));
});
