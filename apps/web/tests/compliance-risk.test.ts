import assert from "node:assert/strict";
import test from "node:test";
import { PROCEDURES, PROCEDURE_IDS } from "../app/data/procedures.generated";
import { assessCompliance, CERTIFICATE_RULES } from "../app/lib/compliance";

const stackOf = (a: ReturnType<typeof assessCompliance>) =>
  a.riskFlags.find((f) => /stack/i.test(f.label))!.evidence.map((e) => e.replace(/ — step \d+$/, ""));

test("rules are indexed by commodity × direction: tea export and tea import need disjoint stacks", () => {
  const exp = assessCompliance(PROCEDURES["868"]);
  const imp = assessCompliance(PROCEDURES["477"]);
  assert.equal(exp.ruleKey, "tea×export");
  assert.equal(imp.ruleKey, "tea×import");
  assert.ok(stackOf(exp).includes("Certificate of origin"));
  assert.ok(stackOf(imp).includes("Quarantine permit"));
  assert.deepEqual(stackOf(exp).filter((d) => stackOf(imp).includes(d)), []);
});

test("every certificate a rule names is produced by a step of each procedure it covers", () => {
  for (const id of PROCEDURE_IDS) {
    const p = PROCEDURES[id];
    const rule = CERTIFICATE_RULES[`${p.goods}×${p.direction}`];
    assert.ok(rule, `${id} has a rule`);
    const outputs = p.blocks.flatMap((b) => b.steps.map((s) => s.output.toLowerCase()));
    for (const c of rule.certificates) assert.ok(outputs.includes(c.toLowerCase()), `${id}: ${c}`);
  }
});

test("a missing destination is stated as unresolved; naming it resolves it", () => {
  const none = assessCompliance(PROCEDURES["325"]);
  assert.ok(none.unresolved.some((u) => /destination/i.test(u.input) && /certificate-of-origin form/i.test(u.blocks)));

  const query = "export 20 tonnes of tomatoes from Tashkent to Almaty by train";
  const kz = assessCompliance(
    PROCEDURES["325"],
    { goods: "tomatoes", quantity: 20, unit: "tonnes", origin: "Tashkent", destination: "Almaty" },
    query,
  );
  assert.ok(!kz.unresolved.some((u) => /destination/i.test(u.input)));
  assert.ok(kz.riskFlags.some((f) => /EAEU/.test(f.label) && f.advisory));
  assert.equal(kz.hsCode, "0702");
  assert.equal(kz.inputs.find((i) => i.key === "partner")?.value, "Kazakhstan");
});

test("rail routed via Iran cites the approval letter the railway application asks for", () => {
  const tr = assessCompliance(
    PROCEDURES["868"],
    { goods: "tea", quantity: 30, unit: "tonnes", origin: "Tashkent", destination: "Istanbul" },
    "export 30 tonnes of tea from Tashkent to Istanbul by train",
  );
  const iran = tr.riskFlags.find((f) => /Iran/.test(f.label));
  assert.ok(iran?.evidence.some((e) => /approval letter — step \d+/.test(e)));
});

test("every input says why it matters, and still no duty rate", () => {
  for (const id of PROCEDURE_IDS) {
    const a = assessCompliance(PROCEDURES[id]);
    assert.ok(a.inputs.length >= 6);
    for (const i of a.inputs) assert.ok(i.why.length > 10, i.key);
    for (const f of a.riskFlags) assert.ok(Array.isArray(f.evidence), f.label);
    assert.ok(!("dutyRangePct" in a));
  }
});
