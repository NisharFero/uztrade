import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { getProcedure } from "../procedures/registry";
import { reconcileNodes } from "./domain";
import { filePortalStep, syncPortalApplications } from "../portals/agent";
import { latestRecords } from "../portals/records";
import type { PortalClient } from "../portals/client";
import { buildLedger } from "../steps/ledger";
import { autoCompletable, stepViewFor } from "../steps/next";
import type { WorkflowNodeRecord, WorkflowRepository } from "./repository";
import { executeSpecialist, scheduleInspection } from "./specialists";
import { recordTransitState } from "../transit/agent";
import { tailorProcedure } from "./tailor";
import type { AgenticAiClient } from "./agentic-ai";

/** `portals`: file online steps with the entity APIs (apps/portals). Without it they are simulated. */
export type OrchestratorOptions = { ai?: AgenticAiClient; portals?: PortalClient; deadline?: number };

const GraphState = Annotation.Root({
  runId: Annotation<string>(),
  progressed: Annotation<boolean>({ reducer: (_current, update) => update, default: () => false }),
});

const stableId = (prefix: string, value: string) => `${prefix}:${value.replace(/[^a-zA-Z0-9:_-]/g, "-")}`;
const entityId = (name: string) => `ent-${name.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}`;
const STALE_AGENT_MS = 50_000;
const RUN_BUDGET_MS = 45_000;

/** "procedure:325:v1" -> the published procedure, when the run is pinned to one. */
async function procedureOf(versionId: string) {
  const id = versionId.match(/^procedure:(.+):v\d+$/)?.[1];
  return id ? await getProcedure(id) : undefined;
}

function userFor(node: WorkflowNodeRecord): string {
  if (/pay|fee|bank/i.test(`${node.title} ${node.channel}`)) return "usr-finance";
  if (/classif|compliance|risk|hs code/i.test(node.title)) return "usr-compliance";
  if (/attend|handover|collect|counter/i.test(node.title)) return "usr-operations";
  return "usr-trader";
}

async function advance(repository: WorkflowRepository, runId: string, options: OrchestratorOptions = {}, deadline = Infinity): Promise<boolean> {
  let projection = await repository.getProjection(runId);
  // A platform timeout can kill a request after a specialist was claimed.
  // Portal reviews are intentionally running and must only be resumed by sync.
  const portal = latestRecords(projection);
  for (const node of projection.nodes) {
    if (node.lane !== "agent" || node.state !== "running" || portal.get(node.stepNum)?.status === "under_review") continue;
    if (node.startedAt && Date.now() - new Date(node.startedAt).getTime() < STALE_AGENT_MS) continue;
    if (await repository.claimNode(node.id, "running", { state: "ready", startedAt: null })) {
      await repository.addAudit({ id: stableId("audit-recovered", `${node.id}:${node.attempts ?? 0}`), runId, nodeId: node.id, eventType: "agent_retry_ready", actorType: "system", data: { attempt: node.attempts ?? 0 } });
    }
  }
  projection = await repository.getProjection(runId);
  const reconciled = reconcileNodes(projection.nodes, projection.edges);
  for (const node of reconciled) {
    const prior = projection.nodes.find((candidate) => candidate.id === node.id)!;
    if (prior.state !== node.state) await repository.updateNode(node.id, { state: node.state });
  }
  projection = await repository.getProjection(runId);
  // Needs are judged against this shipment's workflow, not the bare published procedure.
  const published = await procedureOf(projection.run.procedureVersionId);
  const procedure = published ? tailorProcedure(published, projection.shipmentFacts) : undefined;

  // A paused agent step whose inputs have since been provided resumes.
  if (procedure) {
    const ledger = buildLedger(projection.artifacts);
    for (const paused of projection.nodes.filter((node) => node.lane === "agent" && node.state === "needs_input")) {
      if (!stepViewFor(procedure, projection, ledger, paused).ready) continue;
      const item = projection.workItems.find((candidate) => candidate.nodeId === paused.id && candidate.state === "open");
      if (item) await repository.completeWorkItem(item.id, { verified: true, resumed: true }, "agent");
      await repository.updateNode(paused.id, { state: "ready" });
      await repository.addAudit({ id: stableId("audit-resumed", `${paused.id}:${projection.auditEvents.length}`), runId, nodeId: paused.id, eventType: "agent_resumed", actorType: "agent", data: {} });
      return true;
    }

    // A trader step whose documents Document Intelligence has read and
    // verified completes itself (see autoCompletable for when that is allowed).
    for (const waiting of projection.nodes.filter((node) => node.lane === "user" && node.state === "needs_input").sort((a, b) => a.stepNum - b.stepNum)) {
      const view = stepViewFor(procedure, projection, ledger, waiting);
      const verdict = autoCompletable(view);
      if (!verdict.ok || !view.workItemId) continue;
      const result = { verified: true, verifiedBy: "document_intelligence", documents: verdict.documents, provided: view.needs.filter((n) => n.status === "have").map((n) => n.label) };
      await repository.completeWorkItem(view.workItemId, result, "document_intelligence");
      await repository.updateNode(waiting.id, { state: "completed", result });
      await repository.addAudit({ id: stableId("audit-auto-completed", waiting.id), runId, nodeId: waiting.id, eventType: "step_auto_completed", actorType: "agent", actorId: "document_intelligence", data: { documents: verdict.documents } });
      return true;
    }
  }

  const ready = projection.nodes.filter((node) => node.state === "ready").sort((a, b) => a.stepNum - b.stepNum)[0];

  if (!ready) {
    const completed = projection.nodes.every((node) => node.state === "completed" || node.state === "skipped");
    const failed = projection.nodes.some((node) => node.state === "failed");
    const running = projection.nodes.some((node) => node.state === "running");
    await repository.updateRun(runId, { status: completed ? "completed" : failed ? "failed" : running ? "running" : "waiting_for_input", cycle: projection.run.cycle + 1 });
    return false;
  }

  // Leave ready work for the next request while there is enough time to finish
  // writes and return a response inside the platform's 60 second limit.
  const needed = ready.lane === "agent" ? 12_000 + (options.portals?.timeoutMs ?? 0) * 3 : 0;
  if (Date.now() >= deadline - needed) return false;

  if (ready.optional) {
    await repository.updateNode(ready.id, {
      state: "skipped",
      result: { reason: "Optional procedure route was not selected for this shipment." },
    });
    await repository.addAudit({
      id: stableId("audit-skipped", ready.id),
      runId,
      nodeId: ready.id,
      eventType: "optional_node_skipped",
      actorType: "system",
      data: { reason: "Optional procedure route was not selected for this shipment." },
    });
    return true;
  }

  if (ready.lane === "agent") {
    if (procedure) {
      // The agent does not guess at documents it hasn't got: it pauses and asks.
      const view = stepViewFor(procedure, projection, buildLedger(projection.artifacts), ready);
      if (!view.ready) {
        await repository.ensureWorkItem({ id: stableId("work", ready.id), runId, nodeId: ready.id, lane: "user", assigneeUserId: "usr-trader", entityId: null, state: "open", request: { kind: "agent_inputs", title: ready.title, missing: view.blocking }, result: {} });
        await repository.updateNode(ready.id, { state: "needs_input", assignedUserId: "usr-trader" });
        await repository.addAudit({ id: stableId("audit-paused", `${ready.id}:${projection.auditEvents.length}`), runId, nodeId: ready.id, eventType: "agent_paused", actorType: "agent", data: { missing: view.blocking } });
        return true;
      }
    }
    if (!(await repository.claimNode(ready.id, "ready", { state: "running", attempts: (ready.attempts ?? 0) + 1, startedAt: new Date().toISOString() }))) return false;
    try {
      // An online step with an entity API is filed there, and the entity decides when it is done.
      if (options.portals) {
        const outcome = procedure ? await filePortalStep(repository, projection, procedure, ready, options.portals) : null;
        if (outcome && outcome !== "unavailable") return true;
        if (outcome === "unavailable") {
          // A configured entity has not confirmed success. Retain the work
          // for a subsequent sync, including the same portal idempotency key.
          await repository.claimNode(ready.id, "running", { state: "ready", startedAt: null, result: { retryable: true, reason: "Entity API unavailable; retry on sync." } });
          await repository.addAudit({ id: stableId("audit-unavailable", `${ready.id}:${(ready.attempts ?? 0) + 1}`), runId, nodeId: ready.id, eventType: "portal_unavailable", actorType: "system", data: { reason: "Entity API unavailable; no completion recorded." } });
          return false;
        }
      }
    } catch (error) {
      await repository.claimNode(ready.id, "running", { state: "ready", startedAt: null });
      throw error;
    }
    const completedSteps = new Set(
      projection.nodes.filter((node) => node.state === "completed" || node.state === "skipped").map((node) => node.stepNum),
    );
    let result;
    try {
      result = await executeSpecialist(ready, projection.shipmentFacts, { procedure, completedSteps, ai: options.ai });
    } catch (error) {
      await repository.claimNode(ready.id, "running", { state: "ready", startedAt: null });
      throw error;
    }
    const data = result.data;
    const attempt = (ready.attempts ?? 0) + 1;
    await repository.addAgentRun({ id: stableId("agent-run", `${ready.id}:${attempt}`), runId, nodeId: ready.id, agentName: result.agent, attempt, status: "completed", input: projection.shipmentFacts, output: data });
    await repository.addArtifact({ id: stableId("artifact", ready.id), runId, nodeId: ready.id, type: result.artifactType, name: result.name, data, simulated: true });
    await repository.updateNode(ready.id, { state: "completed", result: data });
    await repository.addAudit({ id: stableId("audit-completed", ready.id), runId, nodeId: ready.id, eventType: "agent_node_completed", actorType: "agent", actorId: result.agent, data: { simulated: true } });
    return true;
  }

  const assigneeUserId = ready.lane === "user" ? userFor(ready) : null;
  const assignedEntityId = ready.lane === "physical" ? entityId(ready.entityName) : null;
  if (ready.lane === "physical" && /inspection|inspect|sample/i.test(ready.title)) {
    const booking = scheduleInspection(ready, projection.shipmentFacts);
    await repository.addAgentRun({ id: stableId("agent-run", `${ready.id}:scheduler`), runId, nodeId: ready.id, agentName: booking.agent, attempt: 1, status: "completed", input: projection.shipmentFacts, output: booking.data });
    await repository.addArtifact({ id: stableId("inspection-booking", ready.id), runId, nodeId: ready.id, type: booking.artifactType, name: booking.name, data: booking.data, simulated: true });
  }
  await repository.ensureWorkItem({ id: stableId("work", ready.id), runId, nodeId: ready.id, lane: ready.lane, assigneeUserId, entityId: assignedEntityId, state: "open", request: { title: ready.title, expectedOutput: ready.output, delegationReason: ready.delegationReason, mock: true }, result: {} });
  await repository.updateNode(ready.id, { state: "needs_input", assignedUserId: assigneeUserId, assignedEntityId });
  await repository.addAudit({ id: stableId("audit-input", ready.id), runId, nodeId: ready.id, eventType: "work_item_created", actorType: "system", data: { lane: ready.lane } });
  return true;
}

export async function runOrchestrator(repository: WorkflowRepository, runId: string, options: OrchestratorOptions = {}) {
  const deadline = Math.min(Date.now() + RUN_BUDGET_MS, options.deadline ?? Infinity);
  if (options.portals) {
    // What the entities decided since the last run comes in first.
    const projection = await repository.getProjection(runId);
    const published = await procedureOf(projection.run.procedureVersionId);
    if (published) await syncPortalApplications(repository, projection, tailorProcedure(published, projection.shipmentFacts), options.portals, deadline);
  }
  const graph = new StateGraph(GraphState)
    .addNode("advance", async (state) => ({ progressed: await advance(repository, state.runId, options, deadline) }))
    .addEdge(START, "advance")
    .addConditionalEdges("advance", (state) => state.progressed ? "advance" : END)
    .compile();
  await graph.invoke({ runId, progressed: true }, { recursionLimit: 1000 });

  // The Transit & Capacity agent reports where the cargo now stands; it writes
  // only when the movement milestone has changed.
  const settled = await repository.getProjection(runId);
  const procedure = await procedureOf(settled.run.procedureVersionId);
  if (procedure && (await recordTransitState(repository, settled, tailorProcedure(procedure, settled.shipmentFacts)))) {
    return repository.getProjection(runId);
  }
  return settled;
}
