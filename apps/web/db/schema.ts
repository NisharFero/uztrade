import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/* A case is one shipment being taken through one of the supported procedures.
 * The procedure definition itself is static; only per-case progress lives in
 * Postgres for the Vercel deployment. */
export const cases = pgTable("cases", {
  id: text("id").primaryKey(),
  procedureId: text("procedure_id").notNull(),
  title: text("title").notNull(),
  goods: text("goods").notNull().default(""),
  query: text("query").notNull().default(""),
  matchedBy: text("matched_by").notNull().default("rules"),
  status: text("status").notNull().default("active"),
  documentState: text("document_state").notNull().default("{}"),
  shipmentFacts: text("shipment_facts").notNull().default("{}"),
  workflowRunId: text("workflow_run_id"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const caseBlocks = pgTable(
  "case_blocks",
  {
    id: serial("id").primaryKey(),
    caseId: text("case_id").notNull(),
    blockId: text("block_id").notNull(),
    state: text("state").notNull().default("waiting"),
    startedAt: timestamp("started_at", { mode: "string" }),
    completedAt: timestamp("completed_at", { mode: "string" }),
    actualHours: real("actual_hours"),
  },
  (t) => [index("case_blocks_case_idx").on(t.caseId)],
);

export type CaseRow = typeof cases.$inferSelect;
export type CaseBlockRow = typeof caseBlocks.$inferSelect;

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    capabilities: text("capabilities").notNull().default("[]"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { mode: "string" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex("users_email_uidx").on(t.email)],
);

export const entities = pgTable(
  "entities",
  {
    id: text("id").primaryKey(),
    canonicalName: text("canonical_name").notNull(),
    type: text("type").notNull(),
    capabilities: text("capabilities").notNull().default("[]"),
    contact: text("contact").notNull().default("{}"),
    simulationMode: boolean("simulation_mode").notNull().default(true),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { mode: "string" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex("entities_name_uidx").on(t.canonicalName)],
);

export const procedureVersions = pgTable(
  "procedure_versions",
  {
    id: text("id").primaryKey(),
    procedureId: text("procedure_id").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull().default("draft"),
    title: text("title").notNull(),
    definition: text("definition").notNull(),
    createdAt: timestamp("created_at", { mode: "string" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex("procedure_version_uidx").on(t.procedureId, t.version)],
);

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id").notNull(),
    procedureVersionId: text("procedure_version_id").notNull(),
    status: text("status").notNull().default("running"),
    cycle: integer("cycle").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "string" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { mode: "string" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex("workflow_runs_case_uidx").on(t.caseId)],
);

export const workflowNodes = pgTable(
  "workflow_nodes",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    blockId: text("block_id").notNull(),
    blockName: text("block_name").notNull(),
    stepNum: integer("step_num").notNull(),
    title: text("title").notNull(),
    outputName: text("output_name").notNull().default(""),
    entityName: text("entity_name").notNull(),
    channel: text("channel").notNull(),
    lane: text("lane").notNull(),
    delegationReason: text("delegation_reason").notNull(),
    optional: boolean("optional").notNull().default(false),
    state: text("state").notNull().default("waiting"),
    assignedUserId: text("assigned_user_id"),
    assignedEntityId: text("assigned_entity_id"),
    input: text("input").notNull().default("{}"),
    output: text("output").notNull().default("{}"),
    attempts: integer("attempts").notNull().default(0),
    startedAt: timestamp("started_at", { mode: "string" }),
    completedAt: timestamp("completed_at", { mode: "string" }),
  },
  (t) => [index("workflow_nodes_run_idx").on(t.runId), uniqueIndex("workflow_node_step_uidx").on(t.runId, t.blockId, t.stepNum)],
);

export const workflowEdges = pgTable(
  "workflow_edges",
  {
    id: serial("id").primaryKey(),
    runId: text("run_id").notNull(),
    fromNodeId: text("from_node_id").notNull(),
    toNodeId: text("to_node_id").notNull(),
    reason: text("reason").notNull(),
  },
  (t) => [index("workflow_edges_run_idx").on(t.runId)],
);

export const workItems = pgTable(
  "work_items",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    lane: text("lane").notNull(),
    assigneeUserId: text("assignee_user_id"),
    entityId: text("entity_id"),
    state: text("state").notNull().default("open"),
    request: text("request").notNull().default("{}"),
    result: text("result").notNull().default("{}"),
    completedBy: text("completed_by"),
    createdAt: timestamp("created_at", { mode: "string" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    completedAt: timestamp("completed_at", { mode: "string" }),
  },
  (t) => [uniqueIndex("work_items_node_uidx").on(t.nodeId), index("work_items_run_idx").on(t.runId)],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    agentName: text("agent_name").notNull(),
    attempt: integer("attempt").notNull(),
    status: text("status").notNull(),
    input: text("input").notNull().default("{}"),
    output: text("output").notNull().default("{}"),
    error: text("error"),
    createdAt: timestamp("created_at", { mode: "string" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    completedAt: timestamp("completed_at", { mode: "string" }),
  },
  (t) => [uniqueIndex("agent_runs_attempt_uidx").on(t.nodeId, t.attempt), index("agent_runs_run_idx").on(t.runId)],
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    nodeId: text("node_id"),
    type: text("type").notNull(),
    name: text("name").notNull(),
    data: text("data").notNull().default("{}"),
    simulated: boolean("simulated").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "string" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("artifacts_run_idx").on(t.runId)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    nodeId: text("node_id"),
    eventType: text("event_type").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    data: text("data").notNull().default("{}"),
    createdAt: timestamp("created_at", { mode: "string" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("audit_events_run_idx").on(t.runId)],
);

