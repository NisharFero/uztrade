import assert from "node:assert/strict";
import test from "node:test";
import { applyCorrections, composeDocument, composeField } from "../../../modules/documents/docai/compose";
import { describeEvidence, readableAnchor } from "../../../modules/documents/docai/evidence";
import { parseUploadedDocument } from "../../../modules/documents/docai/upload";
import { specFor } from "../../../modules/documents/specs";

const weight = specFor("railway_bill").fields.find((f) => f.key === "weight")!;

test("a field says which reader found it, what it was asked or read next to, on which page, and who agreed", () => {
  const field = composeField(weight, [
    { value: "61 200", score: 0.82, source: "layoutlm", question: "What is the weight in kg?", page: 0 },
    { value: "61200", score: 0.7, source: "anchor-right", anchor: "масса\\s*\\(в кг\\)", page: 0 },
  ], []);
  assert.equal(field.source, "layoutlm");
  assert.deepEqual(field.evidence, { question: "What is the weight in kg?", page: 1, agreed: ["anchor-right"] });
  const where = describeEvidence(field);
  assert.equal(where.method, "Layout model");
  assert.match(where.detail, /answered “What is the weight in kg\?”/);
  assert.equal(where.page, 1);
  assert.deepEqual(where.agreed, ["Printed label"]);

  const label = composeField(weight, [{ value: "61200", score: 0.7, source: "anchor-right", anchor: "масса\\s*\\(в кг\\)", page: 1 }], []);
  assert.match(describeEvidence(label).detail, /to the right of “масса \(в кг\)”/);
  assert.equal(readableAnchor("shipper'?s name and address"), "shipper's name and address");
});

test("a demo page read while the document AI is offline says so, field by field", async () => {
  const parsed = await parseUploadedDocument({
    bytes: new ArrayBuffer(8),
    fileName: "161-04-cmr-consignment-note.png",
    contentType: "image/png",
    spec: specFor("cmr_note"),
    procedureId: "161",
    parseWithAi: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(parsed.fallback, "demo");
  const cmr = parsed.document.fields.find((f) => f.key === "cmr_no")!;
  assert.equal(cmr.value, "161-2026/014");
  assert.equal(cmr.source, "demo-pack");
  const where = describeEvidence(cmr);
  assert.equal(where.method, "Demo pack");
  assert.match(where.detail, /printed under “CMR number” on this demo page/);
});

test("what the trader types is theirs; confirming keeps where the rest was found", () => {
  const doc = composeDocument(specFor("railway_bill"), {
    pages: [{ width: 1, height: 1, segments: 1 }],
    text: "",
    fields: { weight: { candidates: [{ value: "61200", score: 0.6, source: "anchor-below", anchor: "масса", page: 0 }] } },
  });
  const [typed] = applyCorrections(doc.fields, { weight: "60000" }).filter((f) => f.key === "weight");
  assert.equal(typed.status, "confirmed");
  assert.equal(describeEvidence(typed).method, "You");
  const [kept] = applyCorrections(doc.fields, {}, true).filter((f) => f.key === "weight");
  assert.equal(kept.status, "confirmed");
  assert.equal(describeEvidence(kept).method, "Printed label");
});
