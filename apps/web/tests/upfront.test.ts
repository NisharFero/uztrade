import assert from "node:assert/strict";
import test from "node:test";
import { runOrchestrator } from "../app/agents/orchestrator";
import { PROCEDURES } from "../app/data/procedures.generated";
import { extractShipmentFacts, instantiateWorkflow } from "../app/domain/workflow";
import { specFor, type DocType } from "../app/lib/document-specs";
import { buildLedger, type DocumentRecord } from "../app/lib/steps/ledger";
import { recordDocument } from "../app/lib/steps/service";
import { upfrontPlan } from "../app/lib/steps/upfront";
import { createMemoryWorkflowRepository } from "../app/lib/workflow-repository";

function confirmedDocument(docType: DocType, label: string, stepNum: number): DocumentRecord {
  return {
    docId: `doc-${docType}-${stepNum}`,
    version: 1,
    label,
    docType,
    stepNum,
    fileName: `${docType}.png`,
    contentType: "image/png",
    size: 1,
    r2Key: null,
    fields: specFor(docType)
      .fields.filter((f) => f.questions.length || f.anchors.length)
      .map((f) => ({ key: f.key, label: f.name, kind: f.kind, required: f.required, value: "x", normalized: "x", confidence: 1, status: "confirmed" as const, source: "trader", alternatives: [] })),
    checks: [],
    detectedType: docType,
    typeMatches: true,
    confirmed: true,
    parseError: null,
    pages: 1,
    timingsMs: null,
    parsedAt: "2026-09-13T00:00:00.000Z",
  };
}

test("868: what can be given at the start, and why the rest has to wait", () => {
  const plan = upfrontPlan(PROCEDURES["868"], buildLedger([]));
  const upfront = new Set(plan.items.map((i) => i.label));
  for (const label of [
    "Electronic copy of foreign trade contract",
    "Passport",
    "Power of attorney",
    "Commercial invoice",
    "Application for cargo transportation GU-12",
    "Certificate on availability of funds at client's account",
    "Tax Identification Number of the organization or individual",
    "Quantity of transport units",
  ]) {
    assert.ok(upfront.has(label), label);
  }

  const later = Object.fromEntries(plan.later.map((l) => [l.label, l.reason]));
  assert.match(later["Payment sum"], /offer/);
  assert.match(later["Agreement with Technological center"], /Technological Center/);
  assert.match(later["Online application for phytosanitary certificate"], /portal/);
  assert.match(later["Receipt of payment"], /Produced/);
  assert.ok(!upfront.has("Invoice for prepayment"));
  assert.ok(!upfront.has("Package of documents"));

  const invoice = plan.items.find((i) => i.label === "Commercial invoice")!;
  assert.equal(invoice.steps[0], 26);
  assert.ok(invoice.steps.includes(41));
  assert.equal(invoice.status, "missing");
});

test("an invoice given upfront lets the agent's declaration step run without pausing", async () => {
  const repository = createMemoryWorkflowRepository();
  const runId = "workflow:T-upfront";
  const procedure = PROCEDURES["868"];
  await repository.createRun(
    { id: runId, caseId: "T-upfront", procedureVersionId: "procedure:868:v1", status: "running", cycle: 0 },
    instantiateWorkflow(procedure, runId),
    extractShipmentFacts("export 60 tonnes of tea from Tashkent to Moscow by train"),
  );
  await runOrchestrator(repository, runId);
  await recordDocument(repository, runId, confirmedDocument("commercial_invoice", "Commercial invoice", 0));

  const plan = upfrontPlan(procedure, buildLedger((await repository.getProjection(runId)).artifacts));
  assert.equal(plan.items.find((i) => i.label === "Commercial invoice")!.status, "have");

  for (const node of (await repository.getProjection(runId)).nodes) {
    if (node.stepNum < 41) await repository.updateNode(node.id, { state: "completed" });
  }
  await runOrchestrator(repository, runId);

  const projection = await repository.getProjection(runId);
  const step41 = projection.nodes.find((n) => n.stepNum === 41)!;
  assert.equal(step41.state, "completed");
  assert.equal(projection.auditEvents.some((e) => e.eventType === "agent_paused" && e.nodeId === step41.id), false);
});
