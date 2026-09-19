/* The agent at an entity's API. For an online step with an entity API it
 * reads the service's published fields, fills them from the case and files
 * the application, then acts on the answer:
 *
 *   422 missing / invalid   -> the step pauses; each field becomes a need, with
 *                              suggested fixes and an explanation (fixes.ts)
 *   under review            -> the step stays running; polled on every run
 *   changes requested       -> the step pauses; the fix is filed as an amendment
 *   approved                -> what the entity issued is recorded; the step completes
 *
 * An unreachable API returns "unavailable" and the orchestrator falls back to
 * simulating the step, as before the APIs existed. */

import type { LlmClient } from "../ai/llm";
import type { Procedure, ProcedureStep } from "../procedures/data/procedures.generated";
import { nextVersion } from "../steps/ledger";
import type { WorkflowNodeRecord, WorkflowProjection, WorkflowRepository } from "../workflow/repository";
import { stepExtras } from "../workflow/tailor";
import { amendApplication, getApplication, portalService, PortalUnavailable, submitApplication, type PortalClient, type PortalDecision } from "./client";
import type { PortalService } from "./contract";
import { helpForFlag } from "./fixes";
import { latestRecords, PORTAL_ARTIFACT, portalRecords, type FlaggedField, type PortalRecord } from "./records";
import { buildFields, sourceContext, type SourceContext } from "./sources";
import { portalTargetOf, type PortalTarget } from "./targets";

export type PortalOutcome = "completed" | "paused" | "under_review" | "unavailable";

const stepOf = (procedure: Procedure, stepNum: number) => procedure.blocks.flatMap((b) => b.steps).find((s) => s.num === stepNum);

/** Matched on the published title - tailoring may rename a step for the shipment. */
export const targetForStep = (step: ProcedureStep): PortalTarget | null => portalTargetOf({ ...step, title: stepExtras(step).publishedTitle });

const safeId = (value: string) => value.replace(/[^a-zA-Z0-9:_-]/g, "-");

/** Help is worked out for the first few flags; the rest carry the entity's reason alone. */
const HELPED_FLAGS = 4;

async function flagged(decision: PortalDecision, service: PortalService, ctx: SourceContext, llm?: LlmClient): Promise<FlaggedField[]> {
  const out: FlaggedField[] = [];
  for (const [index, flag] of decision.flags.entries()) {
    const field = service.fields.find((f) => f.key === flag.field);
    const base = { ...flag, type: field?.type ?? "text", refService: field?.refService ?? null, options: field?.options ?? [], digits: field?.digits ?? null };
    const help = index < HELPED_FLAGS ? await helpForFlag(base, ctx, service.entityName, llm) : { suggestions: [], explanation: null };
    out.push({ ...base, ...help });
  }
  return out;
}

async function applyDecision(
  repository: WorkflowRepository,
  node: WorkflowNodeRecord,
  service: PortalService,
  sent: Record<string, string>,
  decision: PortalDecision,
  latest: PortalRecord | null,
  ctx: SourceContext,
  llm?: LlmClient,
): Promise<PortalOutcome> {
  const runId = node.runId;
  const application = decision.application;
  const revision = decision.status === "rejected" ? latest?.revision ?? 0 : decision.application.revision;
  const stillReviewing = decision.status === "under_review" && latest?.status === "under_review" && latest.applicationId === application?.id && latest.revision === revision;
  if (stillReviewing) return "under_review";

  const version = nextVersion();
  const record: PortalRecord = {
    stepNum: node.stepNum,
    nodeId: node.id,
    entity: service.entity,
    entityName: service.entityName,
    service: service.ref,
    serviceTitle: service.title,
    applicationId: application?.id ?? null,
    reference: application?.reference ?? null,
    status: decision.status,
    revision,
    submitted: decision.status === "rejected" ? sent : decision.application.fields,
    flags: await flagged(decision, service, ctx, llm),
    outputs: decision.status === "approved" ? decision.application.outputs : {},
    message: decision.message,
    version,
    at: new Date().toISOString(),
  };
  await repository.addArtifact({ id: `portal:${runId}:${node.stepNum}:${version}`, runId, nodeId: node.id, type: PORTAL_ARTIFACT, name: `${service.entityName} — ${service.title}`, data: record, simulated: true });
  await repository.addAudit({
    id: `audit-portal:${runId}:${node.stepNum}:${version}`,
    runId,
    nodeId: node.id,
    eventType: `portal_${decision.status}`,
    actorType: "entity",
    actorId: service.entity,
    data: { entity: service.entityName, service: service.title, reference: record.reference, revision, flags: record.flags.map((f) => `${f.label}: ${f.reason}`) },
  });

  if (decision.status === "under_review") {
    if (node.state !== "running") await repository.updateNode(node.id, { state: "running", attempts: (node.attempts ?? 0) + 1 });
    return "under_review";
  }

  if (decision.status === "approved") {
    const reference = decision.application.reference;
    const outputs = decision.application.outputs;
    await repository.addAgentRun({ id: `agent-run:${safeId(node.id)}:portal:${version}`, runId, nodeId: node.id, agentName: "procedure_executor", attempt: (node.attempts ?? 0) + 1, status: "completed", input: sent, output: { entity: service.entity, service: service.id, reference, outputs } });
    await repository.addArtifact({ id: `artifact:portal:${safeId(node.id)}`, runId, nodeId: node.id, type: "execution_receipt", name: `${service.title} — ${reference}`, data: { entity: service.entityName, service: service.title, reference, revision, outputs, sandbox: true }, simulated: true });
    if (node.state !== "running") await repository.updateNode(node.id, { state: "running" });
    await repository.updateNode(node.id, { state: "completed", result: { portal: service.ref, reference, outputs } });
    await repository.addAudit({ id: `audit-completed:${safeId(node.id)}`, runId, nodeId: node.id, eventType: "agent_node_completed", actorType: "agent", actorId: "procedure_executor", data: { portal: service.entityName, reference } });
    return "completed";
  }

  // Refused or sent back: the trader supplies what the entity asked for.
  const missing = record.flags.map((f) => f.label);
  await repository.ensureWorkItem({ id: `work:${safeId(node.id)}`, runId, nodeId: node.id, lane: "user", assigneeUserId: "usr-trader", entityId: null, state: "open", request: { kind: "portal_inputs", title: node.title, entity: service.entityName, missing }, result: {} });
  await repository.updateNode(node.id, { state: "needs_input", assignedUserId: "usr-trader" });
  await repository.addAudit({ id: `audit-paused:${safeId(node.id)}:${version}`, runId, nodeId: node.id, eventType: "agent_paused", actorType: "agent", data: { missing: missing.length ? missing : ["a new submission"], entity: service.entityName } });
  return "paused";
}

/** Files (or amends, or reads back) the application for one agent step. Null when the step has no entity API. */
export async function filePortalStep(
  repository: WorkflowRepository,
  projection: WorkflowProjection,
  procedure: Procedure,
  node: WorkflowNodeRecord,
  client: PortalClient,
): Promise<PortalOutcome | null> {
  const step = stepOf(procedure, node.stepNum);
  const target = step ? targetForStep(step) : null;
  if (!step || !target) return null;
  const latest = latestRecords(projection).get(node.stepNum) ?? null;

  try {
    const service = await portalService(client, target.entity, target.service);
    const ctx = sourceContext(procedure, step, projection);
    const { fields } = buildFields(service.fields, ctx, target.fixed);
    let decision: PortalDecision;
    if (latest?.applicationId && latest.status === "under_review") {
      decision = await getApplication(client, target.entity, latest.applicationId);
    } else if (latest?.applicationId && latest.status !== "approved") {
      decision = await amendApplication(client, target.entity, latest.applicationId, fields);
    } else {
      const attempt = portalRecords(projection).filter((r) => r.stepNum === node.stepNum).length + 1;
      decision = await submitApplication(client, target.entity, target.service, fields, projection.run.caseId, `${node.runId}:${node.stepNum}:${attempt}`);
      // A reviewer that has already decided is read straight back.
      if (decision.status === "under_review") decision = await getApplication(client, target.entity, decision.application.id);
    }
    return await applyDecision(repository, node, service, fields, decision, latest, ctx, client.llm);
  } catch (error) {
    if (error instanceof PortalUnavailable) return "unavailable";
    throw error;
  }
}

/** Reads back every application still under review. */
export async function syncPortalApplications(repository: WorkflowRepository, projection: WorkflowProjection, procedure: Procedure, client: PortalClient) {
  const latest = latestRecords(projection);
  for (const node of projection.nodes) {
    const record = latest.get(node.stepNum);
    if (node.lane !== "agent" || node.state !== "running" || record?.status !== "under_review") continue;
    await filePortalStep(repository, projection, procedure, node, client);
  }
}
