import { runOrchestrator } from "./orchestrator";
import type { Procedure } from "../procedures/data/procedures.generated";
import { tailorProcedure } from "./tailor";
import { extractShipmentFacts, instantiateWorkflow, type ShipmentFacts } from "./domain";
import type { AgenticAiClient } from "./agentic-ai";
import type { PortalClient } from "../portals/client";
import type { WorkflowRepository } from "./repository";

export type WorkflowServiceOptions = { ai?: AgenticAiClient; portals?: PortalClient };

export async function completeWorkflowWorkItem(
  repository: WorkflowRepository,
  workItemId: string,
  result: Record<string, unknown>,
  completedBy: string,
  options: WorkflowServiceOptions = {},
) {
  if (!completedBy.trim()) throw new Error("completedBy is required");
  if (result.verified !== true) throw new Error("Work item must be verified before completion");
  const item = await repository.completeWorkItem(workItemId, result, completedBy);
  await repository.updateNode(item.nodeId, { state: "completed", result });
  await repository.addAudit({ id: `audit-work-completed:${item.id}`, runId: item.runId, nodeId: item.nodeId, eventType: "work_item_completed", actorType: item.lane === "user" ? "user" : "entity", actorId: completedBy, data: result });
  return runOrchestrator(repository, item.runId, options);
}

export async function startWorkflowForCase(caseId: string, procedure: Procedure, query: string, understoodFacts?: ShipmentFacts, options: WorkflowServiceOptions = {}) {
  const [{ createD1WorkflowRepository }, { getDb }, { eq }, { cases }] = await Promise.all([
    import("./d1-repository"),
    import("../../db"),
    import("drizzle-orm"),
    import("../../db/schema"),
  ]);
  const repository = createD1WorkflowRepository();
  const runId = `workflow:${caseId}`;
  try {
    return await repository.getProjection(runId);
  } catch (error) {
    if (!(error instanceof Error) || !/not found/i.test(error.message)) throw error;
  }
  // The run is created from the shipment workflow: every published step, named and sized for this shipment.
  const facts = understoodFacts ?? extractShipmentFacts(query);
  await repository.createRun(
    { id: runId, caseId, procedureVersionId: `procedure:${procedure.id}:v1`, status: "running", cycle: 0 },
    instantiateWorkflow(tailorProcedure(procedure, facts, query), runId),
    facts,
  );
  await getDb().update(cases).set({ workflowRunId: runId }).where(eq(cases.id, caseId));
  const projection = await runOrchestrator(repository, runId, options);
  const { syncCaseBlockProgress } = await import("../cases/block-progress");
  await syncCaseBlockProgress(projection);
  return projection;
}

export async function completePersistedWorkflowWorkItem(
  workItemId: string,
  result: Record<string, unknown>,
  completedBy: string,
  options: WorkflowServiceOptions = {},
) {
  const [{ createD1WorkflowRepository }, { syncCaseBlockProgress }] = await Promise.all([
    import("./d1-repository"),
    import("../cases/block-progress"),
  ]);
  const projection = await completeWorkflowWorkItem(createD1WorkflowRepository(), workItemId, result, completedBy, options);
  await syncCaseBlockProgress(projection);
  return projection;
}

export async function getPersistedWorkflowDag(runId: string) {
  const [{ createD1WorkflowRepository }, { buildDagProjection }] = await Promise.all([
    import("./d1-repository"),
    import("./dag-projection"),
  ]);
  return buildDagProjection(await createD1WorkflowRepository().getProjection(runId));
}
