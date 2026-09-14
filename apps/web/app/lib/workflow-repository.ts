import type { ShipmentFacts, InstantiatedWorkflow, WorkflowNodeDefinition, WorkflowEdgeDefinition, WorkflowNodeState } from "../domain/workflow";

export type WorkflowRunRecord = {
  id: string;
  caseId: string;
  procedureVersionId: string;
  status: "running" | "waiting_for_input" | "failed" | "completed";
  cycle: number;
};

export type WorkflowNodeRecord = WorkflowNodeDefinition & {
  assignedUserId?: string | null;
  assignedEntityId?: string | null;
  input?: Record<string, unknown>;
  result?: Record<string, unknown>;
  attempts?: number;
};

export type WorkItemRecord = {
  id: string;
  runId: string;
  nodeId: string;
  lane: "user" | "physical";
  assigneeUserId?: string | null;
  entityId?: string | null;
  state: "open" | "completed";
  request: Record<string, unknown>;
  result: Record<string, unknown>;
  completedBy?: string | null;
};

export type AgentRunRecord = {
  id: string;
  runId: string;
  nodeId: string;
  agentName: string;
  attempt: number;
  status: "completed" | "failed";
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error?: string | null;
};

export type ArtifactRecord = {
  id: string;
  runId: string;
  nodeId?: string | null;
  type: string;
  name: string;
  data: Record<string, unknown>;
  simulated: boolean;
};

export type AuditEventRecord = {
  id: string;
  runId: string;
  nodeId?: string | null;
  eventType: string;
  actorType: "system" | "agent" | "user" | "entity";
  actorId?: string | null;
  data: Record<string, unknown>;
};

export type WorkflowProjection = {
  run: WorkflowRunRecord;
  shipmentFacts: ShipmentFacts;
  nodes: WorkflowNodeRecord[];
  edges: WorkflowEdgeDefinition[];
  workItems: WorkItemRecord[];
  agentRuns: AgentRunRecord[];
  artifacts: ArtifactRecord[];
  auditEvents: AuditEventRecord[];
};

export interface WorkflowRepository {
  createRun(run: WorkflowRunRecord, workflow: InstantiatedWorkflow, shipmentFacts: ShipmentFacts): Promise<void>;
  getProjection(runId: string): Promise<WorkflowProjection>;
  updateNode(nodeId: string, patch: Partial<WorkflowNodeRecord>): Promise<void>;
  updateRun(runId: string, patch: Partial<WorkflowRunRecord>): Promise<void>;
  ensureWorkItem(item: WorkItemRecord): Promise<WorkItemRecord>;
  completeWorkItem(id: string, result: Record<string, unknown>, completedBy: string): Promise<WorkItemRecord>;
  addAgentRun(run: AgentRunRecord): Promise<void>;
  addArtifact(artifact: ArtifactRecord): Promise<void>;
  addAudit(event: AuditEventRecord): Promise<void>;
}

const clone = <T>(value: T): T => structuredClone(value);

export function createMemoryWorkflowRepository(): WorkflowRepository {
  const projections = new Map<string, WorkflowProjection>();

  const find = (runId: string) => {
    const projection = projections.get(runId);
    if (!projection) throw new Error(`Workflow run ${runId} not found`);
    return projection;
  };

  return {
    async createRun(run, workflow, shipmentFacts) {
      if (projections.has(run.id)) throw new Error(`Workflow run ${run.id} already exists`);
      projections.set(run.id, { run: clone(run), shipmentFacts: clone(shipmentFacts), nodes: clone(workflow.nodes), edges: clone(workflow.edges), workItems: [], agentRuns: [], artifacts: [], auditEvents: [] });
    },
    async getProjection(runId) {
      return clone(find(runId));
    },
    async updateNode(nodeId, patch) {
      for (const projection of projections.values()) {
        const node = projection.nodes.find((candidate) => candidate.id === nodeId);
        if (node) {
          Object.assign(node, clone(patch));
          return;
        }
      }
      throw new Error(`Workflow node ${nodeId} not found`);
    },
    async updateRun(runId, patch) {
      Object.assign(find(runId).run, clone(patch));
    },
    async ensureWorkItem(item) {
      const projection = find(item.runId);
      const existing = projection.workItems.find((candidate) => candidate.nodeId === item.nodeId);
      if (existing) return clone(existing);
      projection.workItems.push(clone(item));
      return clone(item);
    },
    async completeWorkItem(id, result, completedBy) {
      for (const projection of projections.values()) {
        const item = projection.workItems.find((candidate) => candidate.id === id);
        if (!item) continue;
        if (item.state === "completed") throw new Error(`Work item ${id} is already completed`);
        item.state = "completed";
        item.result = clone(result);
        item.completedBy = completedBy;
        return clone(item);
      }
      throw new Error(`Work item ${id} not found`);
    },
    async addAgentRun(run) {
      const projection = find(run.runId);
      if (!projection.agentRuns.some((candidate) => candidate.id === run.id)) projection.agentRuns.push(clone(run));
    },
    async addArtifact(artifact) {
      const projection = find(artifact.runId);
      if (!projection.artifacts.some((candidate) => candidate.id === artifact.id)) projection.artifacts.push(clone(artifact));
    },
    async addAudit(event) {
      const projection = find(event.runId);
      if (!projection.auditEvents.some((candidate) => candidate.id === event.id)) projection.auditEvents.push(clone(event));
    },
  };
}

export function transitionAllowed(from: WorkflowNodeState, to: WorkflowNodeState): boolean {
  const allowed: Record<WorkflowNodeState, WorkflowNodeState[]> = {
    waiting: ["ready", "skipped"],
    ready: ["running", "needs_input", "skipped"],
    running: ["completed", "failed"],
    // An agent step paused for trader inputs goes back to ready once they exist.
    needs_input: ["completed", "skipped", "ready"],
    failed: ["ready", "skipped"],
    completed: [],
    skipped: [],
  };
  return allowed[from].includes(to);
}
