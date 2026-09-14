import assert from "node:assert/strict";
import test from "node:test";
import { PROCEDURES } from "../../../modules/procedures/data/procedures.generated";
import { assessRisk } from "../../../modules/compliance/risk";
import type { Ledger } from "../../../modules/steps/ledger";

const facts = { goods: "tea", quantity: 60, unit: "tonnes", origin: "Tashkent", destination: "Moscow", mode: "train" };
const query = "Export 60 t of tea from Tashkent to Moscow by train";
const row = (report: ReturnType<typeof assessRisk>, key: string) => report.rows.find((r) => r.key === key)!;

test("every row carries a computed value for tea, 60 t, Tashkent → Moscow", () => {
  const report = assessRisk({ procedure: PROCEDURES["868"], facts, query });

  assert.equal(row(report, "procedure").value, "868 · export by train");
  assert.match(row(report, "procedure").reason, /Tashkent \(Uzbekistan\) → Moscow \(Russia\)/);
  assert.match(row(report, "hs").value, /0902/);
  assert.match(row(report, "hs").reason, /green or black/);
  assert.match(row(report, "route").value, /km · via Kazakhstan · .* days/);
  assert.match(row(report, "route").reason, /Via Kazakhstan/);
  assert.equal(row(report, "origin_proof").value, "Form CT-1");
  assert.match(row(report, "origin_proof").reason, /EAEU member/);
  assert.equal(row(report, "units").value, "60 t → 2 covered wagons");
  assert.equal(row(report, "req:Phytosanitary certificate for fresh produce").value, "Not applicable");
  const phytoStep = PROCEDURES["868"].blocks.flatMap((b) => b.steps).find((s) => s.output === "Phytosanitary certificate")!.num;
  assert.equal(row(report, "cert:Phytosanitary certificate").value, `Pending — step ${phytoStep}`);
  assert.equal(row(report, "perishable").value, "Shelf-stable");
  assert.equal(row(report, "duty").value, "Not computed");
  assert.equal(row(report, "inspection").value, "Not estimated");

  for (const r of report.rows) {
    assert.ok(r.value && r.reason, r.key);
    assert.doesNotMatch(r.reason, /^(Decides|Selects|Sets how)/, `${r.key} explains instead of reasoning`);
  }
});

test("a document mismatch becomes an open caution with the values compared", () => {
  const ledger: Ledger = {
    inputs: new Map(),
    documents: [
      {
        docId: "doc-1",
        version: 1,
        label: "Commercial invoice",
        docType: "commercial_invoice",
        stepNum: 25,
        fileName: "invoice.pdf",
        contentType: "application/pdf",
        size: 1,
        r2Key: null,
        fields: [{ key: "hs_code", label: "Customs commodity code", kind: "hs", required: false, value: "0902 30", normalized: "090230", confidence: 0.9, status: "accepted", source: "layoutlm", alternatives: [] }],
        checks: [{ check: "Quantity vs intake", status: "mismatch", detail: "58 t on the quantity / total net weight vs 60 t declared at intake" }],
        detectedType: "commercial_invoice",
        typeMatches: true,
        confirmed: true,
        parseError: null,
        pages: 1,
        timingsMs: null,
        parsedAt: "2026-09-13T00:00:00.000Z",
      },
    ],
  };
  const report = assessRisk({ procedure: PROCEDURES["868"], facts, query, ledger });
  assert.equal(row(report, "quantity_check").status, "caution");
  assert.match(row(report, "quantity_check").value, /58 t .* 60 t/);
  assert.equal(row(report, "hs").status, "ok");
  assert.match(row(report, "hs").value, /090230 \(Commercial invoice\)/);
  assert.equal(report.overall.status, "caution");
  assert.match(report.overall.value, /^Caution · 1 open/);
  assert.match(report.overall.reason, /Quantity check/);
});

test("fresh produce on a long route is high risk; imports list no origin proof", () => {
  const produce = assessRisk({
    procedure: PROCEDURES["325"],
    facts: { goods: "tomatoes", quantity: 20, unit: "tonnes", origin: "Andijan", destination: "Moscow" },
    query: "export 20 tonnes of tomatoes from Andijan to Moscow by train",
  });
  assert.equal(row(produce, "hs").value, "0702");
  assert.match(row(produce, "req:Phytosanitary certificate for fresh produce").value, /Required/);
  assert.ok(["caution", "high"].includes(row(produce, "perishable").status));

  const imported = assessRisk({
    procedure: PROCEDURES["477"],
    facts: { goods: "tea", quantity: 30, unit: "tonnes", origin: "China", destination: "Tashkent" },
    query: "import 30 tonnes of tea from China to Tashkent by train",
  });
  assert.equal(imported.rows.some((r) => r.key === "origin_proof"), false);
  assert.equal(row(imported, "cert:Quarantine permit").value, "Pending — step 4");
});
