import assert from "node:assert/strict";
import test from "node:test";
import { PROCEDURES, PROCEDURE_IDS } from "../app/data/procedures.generated";
import { actionOfStep, delegationOfStep } from "../app/data/delegation";
import { classifyByRules, settleMatch } from "../app/lib/classify";
import { assessCompliance, CAPABILITY_GAPS } from "../app/lib/compliance";

const settle = (q: string) => settleMatch(classifyByRules(q), q);

test("intake asks one question instead of guessing the direction or the mode", () => {
  const direction = settle("I want to move tea by train");
  assert.equal(direction.procedureId, null);
  assert.deepEqual(direction.clarify?.options.map((o) => o.label), ["Export from Uzbekistan", "Import into Uzbekistan"]);
  assert.equal(settle(direction.clarify!.options[0].query).procedureId, "868", "answering settles it");

  const mode = settle("export tea to russia");
  assert.equal(mode.procedureId, null);
  assert.ok(mode.clarify?.options.some((o) => /train/i.test(o.label)));
  assert.ok(mode.clarify?.options.some((o) => /air/i.test(o.label)));
});

test("the route implies the direction; unsupported combinations are refused plainly", () => {
  assert.equal(settle("move 20 tonnes of tea from Tashkent to Moscow").procedureId, "868");
  assert.equal(settle("bring 30 tonnes of tea from China by train").procedureId, "477");
  const road = settle("export tea by road");
  assert.equal(road.procedureId, null);
  assert.equal(road.clarify, undefined);
  assert.match(road.reason, /no published procedure/i);
  assert.equal(settle("hello there").procedureId, null);
});

test("every step has exactly one action, and sign / pay / goods are never the agent's", () => {
  for (const id of PROCEDURE_IDS) {
    for (const b of PROCEDURES[id].blocks) {
      for (const s of b.steps) {
        const action = actionOfStep(s);
        const lane = delegationOfStep(s).lane;
        if (action === "agent") assert.equal(lane, "agent", `${id} step ${s.num}`);
        if (action === "pay" || action === "sign") assert.equal(lane, "user", `${id} step ${s.num} ${s.title}`);
        if (/^online:\s*pay/i.test(s.channel) && !s.optional && !s.alternative) assert.equal(action, "pay", `${id} step ${s.num}`);
      }
    }
  }
});

test("no duty rate is invented; the gap is stated instead", () => {
  for (const id of PROCEDURE_IDS) assert.ok(!("dutyRangePct" in assessCompliance(PROCEDURES[id])));
  assert.ok(CAPABILITY_GAPS.some((g) => /tariff/i.test(g.reason)));
});
