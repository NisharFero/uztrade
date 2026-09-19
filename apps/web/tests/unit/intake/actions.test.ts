import assert from "node:assert/strict";
import test from "node:test";
import { PROCEDURES, PROCEDURE_IDS } from "../../../modules/procedures/sync";
import { actionOfStep, delegationOfStep } from "../../../modules/procedures/delegation";
import { classifyByRules, settleMatch } from "../../../modules/intake/classify";
import { assessCompliance, CAPABILITY_GAPS } from "../../../modules/compliance/compliance";

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

test("every step has exactly one action; signing and paying outside the gateway are never the agent's", () => {
  for (const id of PROCEDURE_IDS) {
    for (const b of PROCEDURES[id].blocks) {
      for (const s of b.steps) {
        const action = actionOfStep(s);
        const lane = delegationOfStep(s).lane;
        if (action === "agent" || action === "gateway") assert.equal(lane, "agent", `${id} step ${s.num}`);
        if (action === "pay" || action === "sign") assert.equal(lane, "user", `${id} step ${s.num} ${s.title}`);
        if (/^online:\s*pay/i.test(s.channel) && !s.optional && !s.alternative) {
          // A bank transfer goes through the payment gateway; any other payee stays the trader's.
          assert.equal(action, /^bank$|online banking system/i.test(s.entity.trim()) ? "gateway" : "pay", `${id} step ${s.num} ${s.entity}`);
        }
      }
    }
  }
});

test("no duty rate is invented; the gap is stated instead", () => {
  for (const id of PROCEDURE_IDS) assert.ok(!("dutyRangePct" in assessCompliance(PROCEDURES[id])));
  assert.ok(CAPABILITY_GAPS.some((g) => /tariff/i.test(g.reason)));
});
