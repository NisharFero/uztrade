import assert from "node:assert/strict";
import test from "node:test";
import { PROCEDURES, PROCEDURE_IDS } from "../../../modules/procedures/data/procedures.generated";
import { DOC_SPECS, docTypeOf, specFor, type DocType } from "../../../modules/documents/specs";
import { allInputs, procedureNeeds } from "../../../modules/procedures/requirements";

test("an application for a certificate is not the certificate", () => {
  assert.equal(docTypeOf("Phytosanitary certificate"), "phytosanitary_certificate");
  assert.equal(docTypeOf("Online application for phytosanitary certificate"), null);
  assert.equal(docTypeOf("Offer agreement for phytosanitary certificate"), "offer_agreement");
  assert.equal(docTypeOf("Export railway bill (SMGS)"), "railway_bill");
  assert.equal(docTypeOf("Cargo customs declaration (IM70)"), "customs_declaration");
});

test("an event is not a document: 'Customs declaration submitted' asks for no upload", () => {
  assert.equal(docTypeOf("Customs declaration submitted"), null);
  assert.equal(docTypeOf("Export customs declaration"), "customs_declaration");
});

test("every customs declaration step's invoice and transport document have field checklists", () => {
  for (const id of PROCEDURE_IDS) {
    const needs = procedureNeeds(PROCEDURES[id]).filter((n) => /^create .*customs declaration/i.test(n.title));
    assert.ok(needs.length, `${id} has a declaration step`);
    for (const n of needs) {
      const types = allInputs(n).map((i) => i.docType);
      assert.ok(types.includes("commercial_invoice"), `${id} step ${n.stepNum}`);
      assert.ok(types.includes("railway_bill") || types.includes("air_waybill"), `${id} step ${n.stepNum}`);
    }
  }
});

test("offer-agreement fields are exactly the ones section 5 lists", () => {
  const listed = new Set<string>();
  for (const id of PROCEDURE_IDS)
    for (const n of procedureNeeds(PROCEDURES[id]))
      for (const i of allInputs(n)) if (i.group === "Data required to complete offer agreement") listed.add(i.label);

  const spec = specFor("offer_agreement").fields.filter((f) => f.source === "procedure").map((f) => f.name);
  assert.deepEqual(new Set(spec), listed);
});

test("every spec has fields and cross-checks, and every spec is used by a procedure", () => {
  const used = new Set<DocType>();
  for (const id of PROCEDURE_IDS)
    for (const n of procedureNeeds(PROCEDURES[id])) for (const i of allInputs(n)) if (i.docType) used.add(i.docType);

  for (const spec of Object.values(DOC_SPECS)) {
    assert.ok(spec.fields.length > 0, spec.type);
    assert.ok(spec.checks.length > 0, spec.type);
    assert.ok(used.has(spec.type), `${spec.type} is never required by any step`);
  }
  assert.ok(specFor("receipt_of_payment").checks.some((c) => c.includes("<case>-P<step>")));
});
