import assert from "node:assert/strict";
import test from "node:test";
import { runOrchestrator } from "../../../modules/workflow/orchestrator";
import { PROCEDURES } from "../../../modules/procedures/sync";
import { extractShipmentFacts, instantiateWorkflow } from "../../../modules/workflow/domain";
import { specFor, type DocType } from "../../../modules/documents/specs";
import { assistantView } from "../../../modules/steps/assistant";
import { AGENT_STEP_MINUTES } from "../../../modules/steps/kpis";
import { buildLedger, type DocumentRecord } from "../../../modules/steps/ledger";
import { stepViewFor } from "../../../modules/steps/next";
import { completeStep, confirmDocument, recordDocument, recordInput, StepNotReady } from "../../../modules/steps/service";
import { createMemoryWorkflowRepository } from "../../../modules/workflow/repository";

async function openRun(procedureId = "868") {
  const repository = createMemoryWorkflowRepository();
  const caseId = `T-${procedureId}`;
  const runId = `workflow:${caseId}`;
  const procedure = PROCEDURES[procedureId];
  await repository.createRun(
    { id: runId, caseId, procedureVersionId: `procedure:${procedureId}:v1`, status: "running", cycle: 0 },
    instantiateWorkflow(procedure, runId),
    extractShipmentFacts("export 60 tonnes of tea from Tashkent to Moscow by train"),
  );
  await runOrchestrator(repository, runId);
  return { repository, runId, caseId, procedure };
}

/** A parsed document with every parseable field confirmed. */
function confirmedDocument(docType: DocType, label: string, stepNum: number, overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    docId: `doc-${docType}-${stepNum}`,
    version: 1,
    label,
    docType,
    stepNum,
    fileName: `${docType}.pdf`,
    contentType: "application/pdf",
    size: 1024,
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
    ...overrides,
  };
}

test("the assistant shows one next step, what it needs, and the KPIs", async () => {
  const { repository, runId, caseId, procedure } = await openRun();
  const view = assistantView(procedure, await repository.getProjection(runId), caseId);

  assert.equal(view.kpis.total, 48);
  assert.equal(view.kpis.completed, 0);
  assert.ok(view.kpis.agentTotal > 0);
  assert.ok(view.kpis.etaHours[1] > view.kpis.etaHours[0]);
  assert.equal(view.kpis.timeSavedMinutes, 0);

  assert.equal(view.next?.stepNum, 1);
  assert.ok(view.parallel.length >= 3, "other blocks are open at the same time");
  const contract = view.next!.needs.find((n) => n.label === "Electronic copy of foreign trade contract")!;
  assert.equal(contract.kind, "document");
  assert.equal(contract.status, "missing");
  assert.ok(contract.requiredFields.includes("Contract number"));
  assert.equal(view.next!.needs.find((n) => n.label === "Electronic digital signature")!.kind, "confirm");
  assert.equal(view.next!.ready, false);
});

test("a trader step can't complete until everything it needs is there", async () => {
  const { repository, runId, caseId, procedure } = await openRun();
  await assert.rejects(() => completeStep(repository, procedure, runId, 1), StepNotReady);

  await recordInput(repository, runId, { kind: "confirm", stepNum: 1, label: "Electronic digital signature", value: "yes" });
  await recordDocument(repository, runId, confirmedDocument("trade_contract", "Electronic copy of foreign trade contract", 1));
  await completeStep(repository, procedure, runId, 1);

  const projection = await repository.getProjection(runId);
  assert.equal(projection.nodes.find((n) => n.stepNum === 1)!.state, "completed");
  const view = assistantView(procedure, projection, caseId);
  assert.equal(view.kpis.completed, 1);
  assert.equal(view.next?.stepNum, 2);
});

test("a document with unconfirmed required fields is under review until the trader confirms it", async () => {
  const { repository, runId, procedure } = await openRun();
  const doc = confirmedDocument("trade_contract", "Electronic copy of foreign trade contract", 1, { confirmed: false });
  doc.fields = doc.fields.map((f) => (f.key === "contract_no" ? { ...f, status: "review", confidence: 0.6 } : f));
  await recordDocument(repository, runId, doc);

  let projection = await repository.getProjection(runId);
  const node = projection.nodes.find((n) => n.stepNum === 1)!;
  const need = stepViewFor(procedure, projection, buildLedger(projection.artifacts), node).needs.find((n) => n.kind === "document")!;
  assert.equal(need.status, "review");
  assert.match(need.detail, /confirm Contract number/);

  await confirmDocument(repository, runId, doc.docId, { contract_no: "UZ-2026/118" }, true);
  projection = await repository.getProjection(runId);
  const after = stepViewFor(procedure, projection, buildLedger(projection.artifacts), node).needs.find((n) => n.kind === "document")!;
  assert.equal(after.status, "have");
});

test("an agent step pauses until the trader's documents exist, then runs by itself", async () => {
  const { repository, runId, caseId, procedure } = await openRun();
  for (const node of (await repository.getProjection(runId)).nodes) {
    if (node.stepNum < 41) await repository.updateNode(node.id, { state: "completed" });
  }
  await runOrchestrator(repository, runId);

  let projection = await repository.getProjection(runId);
  assert.equal(projection.nodes.find((n) => n.stepNum === 41)!.state, "needs_input");
  const view = assistantView(procedure, projection, caseId);
  assert.equal(view.next?.stepNum, 41);
  assert.equal(view.next?.paused, true);
  assert.ok(view.next!.blocking.some((b) => /Commercial invoice/.test(b)), view.next!.blocking.join(" | "));
  assert.ok(view.recent.some((f) => /Agent paused at step 41/.test(f.text)));

  await recordDocument(repository, runId, confirmedDocument("commercial_invoice", "Commercial invoice", 25));
  projection = await repository.getProjection(runId);
  assert.equal(projection.nodes.find((n) => n.stepNum === 41)!.state, "completed");
  assert.ok(projection.auditEvents.some((e) => e.eventType === "agent_resumed"));

  const kpis = assistantView(procedure, projection, caseId).kpis;
  assert.ok(kpis.agentDone >= 1);
  assert.ok(kpis.timeSavedMinutes >= AGENT_STEP_MINUTES);
  assert.match(kpis.timeSavedFormula, /× 45 min/);
});

test("completed step summaries explain operational time, savings and important entity remarks", async () => {
  const { repository, runId, caseId, procedure } = await openRun();
  for (const node of (await repository.getProjection(runId)).nodes) {
    if (node.stepNum < 41) await repository.updateNode(node.id, { state: "completed" });
  }
  await runOrchestrator(repository, runId);
  await recordDocument(repository, runId, confirmedDocument("commercial_invoice", "Commercial invoice", 25));

  const view = assistantView(procedure, await repository.getProjection(runId), caseId);
  const customs = view.completed.find((row) => row.stepNum === 41)!;

  assert.equal(customs.status, "Success");
  assert.match(customs.timeTaken, /\d+ min/);
  assert.equal(customs.timeSaved, "45 min");
  assert.match(customs.remarks, /Customs\/SCC/);
  assert.match(customs.remarks, /invoice/i);
  assert.match(customs.remarks, /final submission/i);
});

test("a value given once is reused at later steps and counted as auto-filled", async () => {
  const { repository, runId, procedure } = await openRun();
  await recordInput(repository, runId, { kind: "value", stepNum: 8, label: "Tax Identification Number of the organization or individual", value: "301234567" });
  const projection = await repository.getProjection(runId);
  const node15 = projection.nodes.find((n) => n.stepNum === 15)!;
  const tin = stepViewFor(procedure, projection, buildLedger(projection.artifacts), node15).needs.find((n) => /Tax Identification/.test(n.label))!;
  assert.equal(tin.status, "have");
  assert.equal(tin.value, "301234567");
  assert.equal(tin.autoFilled, true);
});

test("a bank payment is the agent's: online channel, and nothing moves until the trader authorises it", async () => {
  const { repository, runId, procedure } = await openRun();
  let projection = await repository.getProjection(runId);
  const node4 = projection.nodes.find((n) => n.stepNum === 4)!;
  assert.equal(node4.lane, "agent");
  let view = stepViewFor(procedure, projection, buildLedger(projection.artifacts), node4);
  assert.equal(view.actionLabel, "Agent pays");
  assert.equal(view.variants.find((v) => v.chosen)?.label, "Online payment");
  assert.ok(!view.blocking.some((b) => /Choose one/.test(b)));
  assert.ok(!view.needs.some((n) => n.output && n.docType === "receipt_of_payment"), "the gateway issues the receipt");
  assert.ok(view.blocking.includes("Payment authorisation"));

  await recordInput(repository, runId, { kind: "confirm", stepNum: 4, label: "Payment authorisation", value: "yes" });
  projection = await repository.getProjection(runId);
  view = stepViewFor(procedure, projection, buildLedger(projection.artifacts), node4);
  assert.ok(!view.blocking.includes("Payment authorisation"));
});

test("a payment to anyone but a bank stays with the trader, who picks the channel and uploads the receipt", async () => {
  const { repository, runId, procedure } = await openRun("540");
  const projection = await repository.getProjection(runId);
  const node4 = projection.nodes.find((n) => n.stepNum === 4)!;
  assert.equal(node4.lane, "user");
  const view = stepViewFor(procedure, projection, buildLedger(projection.artifacts), node4);
  assert.ok(view.blocking.some((b) => /Choose one/.test(b)));
  assert.ok(view.needs.some((n) => n.output && n.docType === "receipt_of_payment"));
});
