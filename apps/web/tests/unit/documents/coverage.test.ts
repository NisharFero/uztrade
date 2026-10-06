import assert from "node:assert/strict";
import test from "node:test";
import { DOC_SPECS, docTypeOf } from "../../../modules/documents/specs";
import { allInputs, inputShape, isHeader, procedureNeeds } from "../../../modules/procedures/requirements";
import { PROCEDURE_IDS, PROCEDURES } from "../../../modules/procedures/sync";

test("every shipment input in all 243 procedures is classified", () => {
  const unclassified = new Map<string, string>();
  for (const id of PROCEDURE_IDS) {
    for (const needs of procedureNeeds(PROCEDURES[id])) {
      for (const input of allInputs(needs)) {
        if (input.kind === "case" && inputShape(input.label) === "unclassified") unclassified.set(input.label, `${id} step ${needs.stepNum}`);
      }
    }
  }
  assert.equal(PROCEDURE_IDS.length, 243);
  assert.deepEqual([...unclassified].map(([label, at]) => `${label} (${at})`), [], "classify these in modules/procedures/requirements.ts");
});

test("every document spec says what to read and how to find it", () => {
  for (const spec of Object.values(DOC_SPECS)) {
    // A field with no question or anchor is filled from the case, not read
    // (docai/blank.ts leaves it out): a spec still needs one field it reads.
    const readable = spec.fields.filter((f) => f.required && (f.questions.length || f.anchors.length));
    // An application is drafted from the case, so nothing on it has to be read back.
    if (!spec.type.endsWith("_application")) assert.ok(readable.length, `${spec.type} has no required field Document Intelligence can read`);
    for (const field of spec.fields) {
      for (const anchor of field.anchors) assert.doesNotThrow(() => new RegExp(anchor, "i"), `${spec.type}.${field.key} anchor ${anchor}`);
    }
  }
});

test("the procedures' own wording maps to the right document", () => {
  const cases: [string, string | null][] = [
    ["Vehicle registration certificate", "vehicle_registration"],
    ["International passport", "passport"],
    ["Export declaration of the exporter's country", "customs_declaration"],
    ["Certificate on availability of funds at client's account", "funds_certificate"],
    ["ATP certificate", "atp_certificate"],
    ["Authorization for international carriage of goods", "carriage_permit"],
    ['TIR Carnet - "Transport International Routier"', "tir_carnet"],
    ["Cargo delivery control book (railway)", "cargo_control_book"],
    ["Sales and purchase agreement", "trade_contract"],
    ["Invoice", "commercial_invoice"],
    ["Invoice for payment", "invoice_for_payment"],
    ["Driver's license", "drivers_licence"],
    ["Contract for customs warehouse services", "service_contract"],
    // An application FOR a document is not the document.
    ["Online application for veterinary certificate", null],
    ["Online application for sanitary-epidemiologocal conclusion", null],
  ];
  for (const [label, type] of cases) assert.equal(docTypeOf(label), type, label);
});

test("headers in the source are structure, not inputs to upload", () => {
  for (const label of [
    "Documents requried to complete declaration",
    "Information from following documents is required to complete the application",
    "Optional documents, the submission of which is advisory in nature:",
    "Infromation required to complete online application",
  ]) {
    assert.equal(isHeader(label), "group", label);
  }
  assert.equal(isHeader("To obtain hard copy"), "variant");
  assert.equal(inputShape("Vehicle registration number"), "value");
  assert.equal(inputShape("Application for wagon handover"), "application");
  assert.equal(inputShape("Package of documents"), "kept");
});
