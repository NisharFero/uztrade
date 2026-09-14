import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { agentRuns, artifacts, auditEvents, cases, entities, procedureVersions, users, workItems, workflowNodes, workflowRuns } from "../../db/schema";
import type { Procedure } from "../procedures/data/procedures.generated";
import { validateProcedure } from "../workflow/domain";
import { ensureBackendCatalog } from "./bootstrap";

const db = async () => { await ensureBackendCatalog(); return getDb(); };
const parse = (value: string) => { try { return JSON.parse(value); } catch { return {}; } };
const actorView = <T extends { capabilities: string }>(row: T) => ({ ...row, capabilities: parse(row.capabilities) });

export async function listUsers() { return (await (await db()).select().from(users)).map(actorView); }
export async function getUser(id: string) { const [row] = await (await db()).select().from(users).where(eq(users.id, id)).limit(1); return row ? actorView(row) : null; }
export async function createUser(input: { displayName: string; email: string; role: string; capabilities?: unknown[] }) {
  const row = { id: `usr-${crypto.randomUUID()}`, displayName: input.displayName, email: input.email, role: input.role, capabilities: JSON.stringify(input.capabilities ?? []), status: "active" };
  await (await db()).insert(users).values(row); return getUser(row.id);
}
export async function updateUser(id: string, input: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const key of ["displayName", "email", "role", "status"] as const) if (typeof input[key] === "string") patch[key] = input[key];
  if (Array.isArray(input.capabilities)) patch.capabilities = JSON.stringify(input.capabilities);
  await (await db()).update(users).set(patch).where(eq(users.id, id)); return getUser(id);
}

export async function listEntities() { return (await (await db()).select().from(entities)).map((row) => ({ ...actorView(row), contact: parse(row.contact) })); }
export async function getEntity(id: string) { const [row] = await (await db()).select().from(entities).where(eq(entities.id, id)).limit(1); return row ? { ...actorView(row), contact: parse(row.contact) } : null; }
export async function createEntity(input: { canonicalName: string; type: string; capabilities?: unknown[]; contact?: object }) {
  const row = { id: `ent-${crypto.randomUUID()}`, canonicalName: input.canonicalName, type: input.type, capabilities: JSON.stringify(input.capabilities ?? []), contact: JSON.stringify(input.contact ?? {}), simulationMode: true, status: "active" };
  await (await db()).insert(entities).values(row); return getEntity(row.id);
}
export async function updateEntity(id: string, input: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const key of ["canonicalName", "type", "status"] as const) if (typeof input[key] === "string") patch[key] = input[key];
  if (Array.isArray(input.capabilities)) patch.capabilities = JSON.stringify(input.capabilities);
  if (input.contact && typeof input.contact === "object") patch.contact = JSON.stringify(input.contact);
  await (await db()).update(entities).set(patch).where(eq(entities.id, id)); return getEntity(id);
}

export type EntityQueue = Awaited<ReturnType<typeof listEntities>>[number] & {
  openTasks: { id: string; caseId: string; blockName: string; stepNum: number; title: string }[];
  completedTasks: number;
};

export async function listEntityQueues(): Promise<EntityQueue[]> {
  const d = await db();
  const [entityRows, itemRows, nodeRows, runRows, caseRows] = await Promise.all([
    listEntities(),
    d.select().from(workItems).where(eq(workItems.lane, "physical")),
    d.select().from(workflowNodes),
    d.select().from(workflowRuns),
    d.select({ id: cases.id }).from(cases),
  ]);
  const nodesById = new Map(nodeRows.map((node) => [node.id, node]));
  const casesByRun = new Map(runRows.map((run) => [run.id, run.caseId]));
  const knownCases = new Set(caseRows.map((item) => item.id));

  return entityRows.map((entity) => {
    const assigned = itemRows.filter((item) => item.entityId === entity.id);
    const openTasks = assigned.filter((item) => item.state === "open").flatMap((item) => {
      const node = nodesById.get(item.nodeId);
      const caseId = casesByRun.get(item.runId);
      if (!node || !caseId || !knownCases.has(caseId)) return [];
      return [{ id: item.id, caseId, blockName: node.blockName, stepNum: node.stepNum, title: node.title }];
    });
    return {
      ...entity,
      openTasks,
      completedTasks: assigned.filter((item) => item.state === "completed").length,
    };
  }).sort((a, b) => b.openTasks.length - a.openTasks.length || a.canonicalName.localeCompare(b.canonicalName));
}

export async function listProcedureVersions(procedureId?: string) {
  const d = await db();
  const rows = procedureId ? await d.select().from(procedureVersions).where(eq(procedureVersions.procedureId, procedureId)).orderBy(desc(procedureVersions.version)) : await d.select().from(procedureVersions).orderBy(procedureVersions.procedureId, desc(procedureVersions.version));
  return rows.map((row) => ({ ...row, definition: parse(row.definition) }));
}
export async function createProcedureVersion(definition: Procedure, publish = false) {
  validateProcedure(definition);
  const existing = await listProcedureVersions(definition.id);
  const version = Math.max(0, ...existing.map((row) => row.version)) + 1;
  const id = `procedure:${definition.id}:v${version}`;
  await (await db()).insert(procedureVersions).values({ id, procedureId: definition.id, version, status: publish ? "published" : "draft", title: definition.title, definition: JSON.stringify(definition) });
  return (await listProcedureVersions(definition.id)).find((row) => row.id === id)!;
}
export async function publishProcedureVersion(id: string) {
  const d = await db();
  const [target] = await d.select().from(procedureVersions).where(eq(procedureVersions.id, id)).limit(1);
  if (!target) return null;
  await d.update(procedureVersions).set({ status: "archived" }).where(and(eq(procedureVersions.procedureId, target.procedureId), eq(procedureVersions.status, "published")));
  await d.update(procedureVersions).set({ status: "published" }).where(eq(procedureVersions.id, id));
  return (await listProcedureVersions(target.procedureId)).find((row) => row.id === id)!;
}

export async function listOperationalRows(kind: "work_items" | "agent_runs" | "artifacts" | "audit_events", runId?: string) {
  const d = await db();
  if (kind === "work_items") return runId ? d.select().from(workItems).where(eq(workItems.runId, runId)) : d.select().from(workItems);
  if (kind === "agent_runs") return runId ? d.select().from(agentRuns).where(eq(agentRuns.runId, runId)) : d.select().from(agentRuns);
  if (kind === "artifacts") return runId ? d.select().from(artifacts).where(eq(artifacts.runId, runId)) : d.select().from(artifacts);
  return runId ? d.select().from(auditEvents).where(eq(auditEvents.runId, runId)) : d.select().from(auditEvents);
}
