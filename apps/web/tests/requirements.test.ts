import assert from "node:assert/strict";
import test from "node:test";
import { PROCEDURES, PROCEDURE_IDS } from "../app/data/procedures.generated";
import { allInputs, collectOnce, isHeader, procedureNeeds, stepNeeds, waitingOn } from "../app/lib/requirements";

test("section 5 inputs are carried on every step, as published", () => {
  const expected: Record<string, number> = { "306": 181, "325": 181, "477": 218, "540": 160, "868": 181 };
  for (const id of PROCEDURE_IDS) {
    const steps = PROCEDURES[id].blocks.flatMap((b) => b.steps);
    assert.ok(steps.every((s) => Array.isArray(s.inputs)), id);
    assert.equal(steps.reduce((n, s) => n + s.inputs.length, 0), expected[id], id);
  }
});

test("the 325 export declaration needs documents that earlier steps produce", () => {
  const needs = stepNeeds(PROCEDURES["325"], 41);
  const input = (label: string) => needs.common.find((i) => i.label === label);
  assert.equal(input("Export railway bill (SMGS)")?.producedBy?.stepNum, 40);
  assert.equal(input("Phytosanitary certificate")?.producedBy?.stepNum, 36);
  assert.equal(input("Certificate of origin")?.producedBy?.stepNum, 30);
  assert.equal(input("Identification number of foreign trade contract")?.producedBy?.stepNum, 1);
  assert.equal(input("Electronic digital signature")?.kind, "identity");
  assert.equal(input("Commercial invoice")?.kind, "case");
  assert.equal(input("Certificate of origin form A")?.optional, true, "listed under 'not obligatory'");
  assert.equal(input("Commercial invoice")?.optional, false);

  const waiting = waitingOn(needs, (n) => n !== 40);
  assert.deepEqual(waiting.map((i) => i.label), ["Export railway bill (SMGS)"]);
});

test("payment steps split into alternative channels", () => {
  const needs = stepNeeds(PROCEDURES["325"], 4);
  assert.deepEqual(needs.variants.map((v) => v.label), ["Physical payment", "Online payment"]);
  assert.equal(needs.variants[1].inputs[0].label, "Online banking account");
  assert.equal(needs.variants[1].inputs[0].kind, "identity");
  assert.equal(needs.common.find((i) => i.label === "Agreement with Technological center")?.producedBy?.stepNum, 2);
});

test("offer-agreement data is company profile, asked for once and reused", () => {
  const needs = stepNeeds(PROCEDURES["325"], 15);
  const tin = needs.common.find((i) => /Tax Identification/.test(i.label));
  assert.equal(tin?.kind, "profile");
  assert.equal(tin?.group, "Data required to complete offer agreement");

  const once = collectOnce(PROCEDURES["325"]);
  assert.deepEqual(once.profile.find((i) => /Tax Identification/.test(i.label))?.steps, [8, 15, 19, 32]);
  assert.ok((once.case.find((i) => i.label === "Commercial invoice")?.steps.length ?? 0) >= 5);
});

test("the import side has its own chain: quarantine permit feeds the inspection", () => {
  const needs = stepNeeds(PROCEDURES["477"], 29);
  assert.equal(needs.common.find((i) => i.label === "Quarantine permit")?.producedBy?.stepNum, 4);
  assert.equal(stepNeeds(PROCEDURES["477"], 17).common.find((i) => i.label === "Import railway bill")?.producedBy?.stepNum, 16);
});

test("produced inputs only point backwards and headers never leak as inputs", () => {
  for (const id of PROCEDURE_IDS) {
    for (const needs of procedureNeeds(PROCEDURES[id])) {
      for (const input of allInputs(needs)) {
        assert.equal(isHeader(input.label), null, `${id} step ${needs.stepNum}: ${input.label}`);
        if (input.producedBy) assert.ok(input.producedBy.stepNum < needs.stepNum, `${id} step ${needs.stepNum}: ${input.label}`);
      }
    }
  }
});
