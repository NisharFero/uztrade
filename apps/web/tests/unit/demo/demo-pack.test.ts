import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { PROCEDURES } from "../../../modules/procedures/sync";
import { extractShipmentFacts, instantiateWorkflow } from "../../../modules/workflow/domain";
import { parseTonnes } from "../../../modules/documents/docai/validate";
import { DEMO_PROCEDURES, demoFor, demoForNeed } from "../../../modules/demo/demo";
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

test("bank payments are authorised rather than receipted, and shared documents are reused", () => {
  const views = walk868();
  for (const stepNum of [12, 28]) {
    const needs = views.find((v) => v.stepNum === stepNum)!.needs;
    assert.ok(!needs.some((n) => n.output && n.docType === "receipt_of_payment"), `step ${stepNum}: the gateway issues the receipt`);
    assert.ok(needs.some((n) => n.kind === "confirm" && n.label === "Payment authorisation"), `step ${stepNum}: asks for authorisation`);
  }
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

function walk(id: string) {
  const procedure = PROCEDURES[id];
  const runId = `demo:${id}`;
  const workflow = instantiateWorkflow(procedure, runId);
  const projection: WorkflowProjection = {
    run: { id: runId, caseId: "demo", procedureVersionId: `procedure:${id}:v1`, status: "running", cycle: 0 },
    shipmentFacts: { goods: "", quantity: null, unit: null, origin: null, destination: null, mode: null },
    nodes: workflow.nodes, edges: workflow.edges, workItems: [], agentRuns: [], artifacts: [], auditEvents: [],
  };
  return workflow.nodes.map((node) => stepViewFor(procedure, projection, buildLedger([]), node));
}

test("every demo procedure has a pack covering every document and value its walk-through needs", () => {
  for (const id of DEMO_PROCEDURES) {
    const scenario = demoFor(id);
    assert.ok(scenario, `${id} has a demo pack`);
    const missing: string[] = [];
    for (const view of walk(id)) {
      for (const need of [...view.needs, ...view.variants.flatMap((v) => v.needs)]) {
        if (need.kind !== "document" && need.kind !== "value") continue;
        if (!demoForNeed(id, need, view.stepNum)) missing.push(`step ${view.stepNum}: ${need.label}${need.output ? " (output)" : ""}`);
      }
    }
    assert.deepEqual(missing, [], id);
    for (const doc of scenario.documents) assert.ok(existsSync(`public/demo/${id}/${doc.file}`), `${id}/${doc.file}`);
  }
});

test("generated packs: receipts pay what was offered, weights agree with intake, files are unique", () => {
  const files = new Set<string>();
  for (const id of DEMO_PROCEDURES.filter((p) => p !== "868")) {
    const scenario = demoFor(id)!;
    const intake = extractShipmentFacts(String(scenario.shipment.query));
    const tonnes = parseTonnes(`${intake.quantity} ${intake.unit}`);
    for (const doc of scenario.documents) {
      assert.ok(!files.has(doc.file), `${doc.file} is unique across packs`);
      files.add(doc.file);
      const weight = doc.fields.quantity ?? doc.fields.net_weight;
      if (weight && /kg/.test(weight)) assert.equal(parseTonnes(weight), tonnes, `${id} ${doc.id}`);
    }
    // Walking the pack in step order, a receipt pays the offer or invoice still open.
    const ordered = [...scenario.documents].sort((x, y) => Math.min(...x.steps) - Math.min(...y.steps) || Number(x.output) - Number(y.output));
    let open: string | null = null;
    for (const d of ordered) {
      if (d.docType === "offer_agreement" || d.docType === "invoice_for_payment") open = d.fields.amount ?? d.fields.total ?? null;
      if (d.docType !== "receipt_of_payment") continue;
      assert.ok(d.fields.amount, `${id} ${d.id} has an amount`);
      if (open) assert.equal(d.fields.amount, open, `${id} ${d.id} pays the open offer`);
      open = null;
    }
  }
});
