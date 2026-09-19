/* Step actions against a workflow repository. Each writes to the case ledger
 * and then lets the orchestrator move: a paused agent step whose inputs are now
 * there resumes on its own. Completing a trader step is refused while anything
 * it needs is still missing. */

import { runOrchestrator } from "../workflow/orchestrator";
import type { Procedure } from "../procedures/data/procedures.generated";
import { applyCorrections, summarize } from "../documents/docai/compose";
import type { AgenticAiClient } from "../workflow/agentic-ai";
import type { PortalClient } from "../portals/client";
import type { WorkflowRepository } from "../workflow/repository";
import { completeWorkflowWorkItem } from "../workflow/service";
import { buildLedger, DOCUMENT_ARTIFACT, INPUT_ARTIFACT, inputKey, nextVersion, type DocumentRecord, type InputKind } from "./ledger";
import { stepViewFor } from "./next";

export type StepServiceOptions = { ai?: AgenticAiClient; portals?: PortalClient };

export class StepNotReady extends Error {
  constructor(public stepNum: number, public missing: string[]) {
    super(`Step ${stepNum} still needs: ${missing.join("; ")}`);
  }
}

export async function recordInput(
  repository: WorkflowRepository,
  runId: string,
  input: { kind: InputKind; stepNum: number; label: string; value: string },
  options: StepServiceOptions = {},
) {
  const key = inputKey(input.kind, input.stepNum, input.label);
  const version = nextVersion();
  await repository.addArtifact({
    id: `input:${runId}:${key}:${version}`,
    runId,
    nodeId: null,
    type: INPUT_ARTIFACT,
    name: input.label,
    data: { key, kind: input.kind, label: input.label, stepNum: input.stepNum, value: input.value, version },
    simulated: false,
  });
  await repository.addAudit({
    id: `audit-input:${runId}:${key}:${version}`,
    runId,
    nodeId: null,
    eventType: "input_recorded",
    actorType: "user",
    actorId: "usr-trader",
    data: { label: input.label, stepNum: input.stepNum, kind: input.kind },
  });
  return runOrchestrator(repository, runId, options);
}

export async function recordDocument(repository: WorkflowRepository, runId: string, record: DocumentRecord, options: StepServiceOptions = {}) {
  const s = summarize(record.fields);
  const summary = record.parseError
    ? `Stored ${record.label} (step ${record.stepNum}) — not parsed: ${record.parseError}`
    : `Read ${record.label} (step ${record.stepNum}): ${s.accepted} fields accepted, ${s.review} to review, ${s.missing} not found`;
  await repository.addArtifact({
    id: `document:${runId}:${record.docId}:${record.version}`,
    runId,
    nodeId: null,
    type: DOCUMENT_ARTIFACT,
    name: record.label,
    data: record as unknown as Record<string, unknown>,
    simulated: false,
  });
  await repository.addAudit({
    id: `audit-document:${runId}:${record.docId}:${record.version}`,
    runId,
    nodeId: null,
    eventType: "document_parsed",
    actorType: "agent",
    actorId: "document_intelligence",
    data: { summary, docType: record.docType, stepNum: record.stepNum },
  });
  return runOrchestrator(repository, runId, options);
}

/** The trader's review of a parsed document: typed corrections are confirmed;
 *  `confirmAll` accepts the remaining parsed values as read. */
export async function confirmDocument(
  repository: WorkflowRepository,
  runId: string,
  docId: string,
  corrections: Record<string, string | null>,
  confirmAll: boolean,
  options: StepServiceOptions = {},
) {
  const ledger = buildLedger((await repository.getProjection(runId)).artifacts);
  const current = ledger.documents.find((d) => d.docId === docId);
  if (!current) throw new Error(`Document ${docId} not found`);
  const fields = applyCorrections(current.fields, corrections, confirmAll);
  const open = summarize(fields).requiredOpen;
  return recordDocument(repository, runId, {
    ...current,
    fields,
    version: nextVersion(),
    confirmed: confirmAll && open.length === 0,
  }, options);
}

export async function completeStep(repository: WorkflowRepository, procedure: Procedure, runId: string, stepNum: number, completedBy = "usr-trader", options: StepServiceOptions = {}) {
  const projection = await repository.getProjection(runId);
  const node = projection.nodes.find((n) => n.stepNum === stepNum);
  if (!node) throw new Error(`Step ${stepNum} not found`);
  if (node.state !== "needs_input") throw new Error(`Invalid transition: step ${stepNum} is ${node.state}, not waiting for input`);

  const view = stepViewFor(procedure, projection, buildLedger(projection.artifacts), node);
  if (!view.ready) throw new StepNotReady(stepNum, view.blocking);

  // A paused agent step resumes through the orchestrator once its inputs exist.
  if (node.lane === "agent") return runOrchestrator(repository, runId, options);
  if (!view.workItemId) throw new Error(`Invalid transition: step ${stepNum} has no open work item`);
  return completeWorkflowWorkItem(
    repository,
    view.workItemId,
    { verified: true, provided: view.needs.filter((n) => n.status === "have").map((n) => n.label) },
    completedBy,
    options,
  );
}

/** Lets the orchestrator read back what the entities decided since the last run. */
export async function syncCase(repository: WorkflowRepository, runId: string, options: StepServiceOptions = {}) {
  return runOrchestrator(repository, runId, options);
}
