import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { PROCEDURES } from "../../../modules/procedures/data/procedures.generated";
import { extractShipmentFacts, instantiateWorkflow } from "../../../modules/workflow/domain";
import { parseTonnes } from "../../../modules/documents/docai/validate";
import { demoFor, demoForNeed } from "../../../modules/demo/demo";
import { buildLedger } from "../../../modules/steps/ledger";
import { stepViewFor } from "../../../modules/steps/next";
import type { WorkflowProjection } from "../../../modules/workflow/repository";

function walk868() {
  const procedure = PROCEDURES["868"];
  const runId = "demo:868";
  const workflow = instantiateWorkflow(procedure, runId);
  const projection: WorkflowProjection = {
    run: { id: runId, caseId: "demo", procedureVersionId: "procedure:868:v1", status: "running", cycle: 0 },
    shipmentFacts: { goods: "", quantity: null, unit: null, origin: null, destination: null, mode: null },
    nodes: workflow.nodes, edges: workflow.edges, workItems: [], agentRuns: [], artifacts: [], auditEvents: [],
  };
  return workflow.nodes.map((node) => stepViewFor(procedure, projection, buildLedger([]), node));
}

test("every document and value a walk-through of 868 needs has a demo", () => {
  const missing: string[] = [];
  for (const view of walk868()) {
    for (const need of [...view.needs, ...view.variants.flatMap((v) => v.needs)]) {
      if (need.kind !== "document" && need.kind !== "value") continue;
      if (!demoForNeed("868", need, view.stepNum)) missing.push(`step ${view.stepNum}: ${need.label}${need.output ? " (output)" : ""}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("each payment step gets its own receipt, and shared documents are reused", () => {
  const views = walk868();
  const receiptAt = (stepNum: number) => {
    const need = views.find((v) => v.stepNum === stepNum)!.needs.find((n) => n.output && n.docType === "receipt_of_payment")!;
    const match = demoForNeed("868", need, stepNum);
    return match?.kind === "document" ? match.document.id : null;
  };
  assert.equal(receiptAt(12), "receipt-12");
  assert.equal(receiptAt(28), "receipt-28");
  const invoiceAt41 = views.find((v) => v.stepNum === 41)!.needs.find((n) => n.label === "Commercial invoice")!;
  const match = demoForNeed("868", invoiceAt41, 41);
  assert.equal(match?.kind === "document" ? match.document.id : null, "commercial-invoice");
});

test("demo files exist for every scenario document", () => {
  for (const doc of demoFor("868")!.documents) assert.ok(existsSync(`public/demo/868/${doc.file}`), doc.file);
});

test("demo amounts pair up and quantities agree with intake", () => {
  const scenario = demoFor("868")!;
  const doc = (id: string) => scenario.documents.find((d) => d.id === id)!.fields;
  assert.equal(doc("receipt-9").amount, doc("invoice-forwarder").total);
  assert.equal(doc("receipt-12").amount, doc("offer-internal-phyto").amount);
  assert.equal(doc("receipt-16").amount, doc("offer-fumigation").amount);
  assert.equal(doc("receipt-28").amount, doc("offer-phyto").amount);
  assert.equal(doc("receipt-33").amount, doc("invoice-prepayment").total);

  const intake = extractShipmentFacts(String(scenario.shipment.query));
  assert.equal(intake.quantity, 60);
  assert.equal(parseTonnes(doc("commercial-invoice").quantity), 60);
  assert.equal(parseTonnes(doc("smgs").weight), 60);
  assert.equal(doc("gu12").tonnes, "60");
});
