import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { agentRuns, artifacts, auditEvents, cases, workItems, workflowEdges, workflowNodes, workflowRuns } from "../../db/schema";
import type { ShipmentFacts } from "./domain";
import { ensureBackendCatalog } from "../catalog/bootstrap";
import { chunkForD1 } from "./d1-batching";
import type { AgentRunRecord, AuditEventRecord, WorkflowNodeRecord, WorkflowProjection, WorkflowRepository, WorkflowRunRecord, WorkItemRecord } from "./repository";

const json = (value: unknown) => JSON.stringify(value ?? {});
/* SQLite CURRENT_TIMESTAMP is UTC without a zone ("2026-09-14 06:43:29"); JS would read it as local time. */
const iso = (value: string | null | undefined) => (value ? (/[TZ]/.test(value) ? value : `${value.replace(" ", "T")}Z`) : undefined);
const parse = <T>(value: string, fallback: T): T => {
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

export function createD1WorkflowRepository(): WorkflowRepository {
  const readyDb = async () => { await ensureBackendCatalog(); return getDb(); };
  return {
    async createRun(run, workflow, shipmentFacts) {
      const db = await readyDb();
      const nodeParts = chunkForD1(workflow.nodes).map((part) => part.map((node) => ({ ...node, outputName: node.output, output: "{}", input: "{}", attempts: 0 })));
      const edgeParts = chunkForD1(workflow.edges, 20);
      if (/neon\.tech|neon\.build/i.test(process.env.DATABASE_URL ?? "")) {
        // Neon HTTP cannot run an interactive Drizzle transaction, but its
        // batch method sends these statements as one atomic transaction.
        const statements = [
          db.insert(workflowRuns).values(run),
          ...nodeParts.map((part) => db.insert(workflowNodes).values(part)),
          ...edgeParts.map((part) => db.insert(workflowEdges).values(part)),
          db.update(cases).set({ shipmentFacts: json(shipmentFacts), workflowRunId: run.id }).where(eq(cases.id, run.caseId)),
        ];
        await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
      } else {
        // Local Postgres supports the ordinary interactive transaction.
        await db.transaction(async (tx) => {
          await tx.insert(workflowRuns).values(run);
          for (const part of nodeParts) await tx.insert(workflowNodes).values(part);
          for (const part of edgeParts) await tx.insert(workflowEdges).values(part);
          await tx.update(cases).set({ shipmentFacts: json(shipmentFacts), workflowRunId: run.id }).where(eq(cases.id, run.caseId));
        });
      }
    },
    async getProjection(runId) {
      const db = await readyDb();
      const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).limit(1);
      if (!run) throw new Error(`Workflow run ${runId} not found`);
      const [caseRow] = await db.select({ shipmentFacts: cases.shipmentFacts }).from(cases).where(eq(cases.id, run.caseId)).limit(1);
      const [nodeRows, edgeRows, itemRows, agentRows, artifactRows, auditRows] = await Promise.all([
        db.select().from(workflowNodes).where(eq(workflowNodes.runId, runId)),
        db.select().from(workflowEdges).where(eq(workflowEdges.runId, runId)),
        db.select().from(workItems).where(eq(workItems.runId, runId)),
        db.select().from(agentRuns).where(eq(agentRuns.runId, runId)),
        db.select().from(artifacts).where(eq(artifacts.runId, runId)),
        db.select().from(auditEvents).where(eq(auditEvents.runId, runId)),
      ]);
      return {
        run: { id: run.id, caseId: run.caseId, procedureVersionId: run.procedureVersionId, status: run.status as WorkflowRunRecord["status"], cycle: run.cycle },
        shipmentFacts: parse<ShipmentFacts>(caseRow?.shipmentFacts ?? "{}", { goods: "", quantity: null, unit: null, origin: null, destination: null, mode: null }),
        nodes: nodeRows.map((row) => ({ id: row.id, runId: row.runId, blockId: row.blockId, blockName: row.blockName, stepNum: row.stepNum, title: row.title, output: row.outputName, entityName: row.entityName, channel: row.channel, lane: row.lane as WorkflowNodeRecord["lane"], delegationReason: row.delegationReason, optional: row.optional, state: row.state as WorkflowNodeRecord["state"], assignedUserId: row.assignedUserId, assignedEntityId: row.assignedEntityId, input: parse(row.input, {}), result: parse(row.output, {}), attempts: row.attempts, startedAt: iso(row.startedAt) })),
        edges: edgeRows.map((row) => ({ runId: row.runId, fromNodeId: row.fromNodeId, toNodeId: row.toNodeId, reason: row.reason })),
        workItems: itemRows.map((row) => ({ id: row.id, runId: row.runId, nodeId: row.nodeId, lane: row.lane as WorkItemRecord["lane"], assigneeUserId: row.assigneeUserId, entityId: row.entityId, state: row.state as WorkItemRecord["state"], request: parse(row.request, {}), result: parse(row.result, {}), completedBy: row.completedBy, createdAt: iso(row.createdAt), completedAt: iso(row.completedAt) ?? null })),
        agentRuns: agentRows.map((row) => ({ id: row.id, runId: row.runId, nodeId: row.nodeId, agentName: row.agentName, attempt: row.attempt, status: row.status as AgentRunRecord["status"], input: parse(row.input, {}), output: parse(row.output, {}), error: row.error })),
        artifacts: artifactRows.map((row) => ({ id: row.id, runId: row.runId, nodeId: row.nodeId, type: row.type, name: row.name, data: parse(row.data, {}), simulated: row.simulated })),
        auditEvents: auditRows.map((row) => ({ id: row.id, runId: row.runId, nodeId: row.nodeId, eventType: row.eventType, actorType: row.actorType as AuditEventRecord["actorType"], actorId: row.actorId, data: parse(row.data, {}), at: iso(row.createdAt) })),
      } satisfies WorkflowProjection;
    },
    async updateNode(nodeId, patch) {
      const db = await readyDb();
      const values: Record<string, unknown> = { ...patch };
      if ("result" in values) { values.output = json(values.result); delete values.result; }
      if ("input" in values) values.input = json(values.input);
      delete values.id; delete values.runId; delete values.outputName;
      await db.update(workflowNodes).set(values).where(eq(workflowNodes.id, nodeId));
    },
    async claimNode(nodeId, from, patch) {
      const db = await readyDb();
      const values: Record<string, unknown> = { ...patch };
      if ("result" in values) { values.output = json(values.result); delete values.result; }
      if ("input" in values) values.input = json(values.input);
      delete values.id; delete values.runId; delete values.outputName;
      const rows = await db.update(workflowNodes).set(values).where(and(eq(workflowNodes.id, nodeId), eq(workflowNodes.state, from))).returning({ id: workflowNodes.id });
      return rows.length === 1;
    },
    async updateRun(runId, patch) {
      const db = await readyDb();
      await db.update(workflowRuns).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(workflowRuns.id, runId));
    },
    async ensureWorkItem(item) {
      const db = await readyDb();
      await db.insert(workItems).values({ ...item, request: json(item.request), result: json(item.result) }).onConflictDoNothing();
      const [row] = await db.select().from(workItems).where(eq(workItems.nodeId, item.nodeId)).limit(1);
      return { ...item, ...row, lane: row.lane as WorkItemRecord["lane"], state: row.state as WorkItemRecord["state"], request: parse(row.request, {}), result: parse(row.result, {}) };
    },
    async completeWorkItem(id, result, completedBy) {
      const db = await readyDb();
      const [row] = await db.select().from(workItems).where(eq(workItems.id, id)).limit(1);
      if (!row) throw new Error(`Work item ${id} not found`);
      if (row.state === "completed") throw new Error(`Work item ${id} is already completed`);
      const updated = await db.update(workItems).set({ state: "completed", result: json(result), completedBy, completedAt: new Date().toISOString() }).where(and(eq(workItems.id, id), eq(workItems.state, "open"))).returning({ id: workItems.id });
      if (!updated.length) throw new Error(`Work item ${id} is already completed`);
      return { id: row.id, runId: row.runId, nodeId: row.nodeId, lane: row.lane as WorkItemRecord["lane"], assigneeUserId: row.assigneeUserId, entityId: row.entityId, state: "completed", request: parse(row.request, {}), result, completedBy };
    },
    async addAgentRun(run) { const db = await readyDb(); await db.insert(agentRuns).values({ ...run, input: json(run.input), output: json(run.output), completedAt: new Date().toISOString() }).onConflictDoNothing(); },
    async addArtifact(artifact) { const db = await readyDb(); await db.insert(artifacts).values({ ...artifact, data: json(artifact.data) }).onConflictDoNothing(); },
    async addAudit(event) { const db = await readyDb(); await db.insert(auditEvents).values({ ...event, data: json(event.data) }).onConflictDoNothing(); },
  };
}
