import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/* A case is one shipment being taken through one of the five procedures.
 * The procedure definition itself is static (app/data/procedures.generated.ts);
 * only per-case progress lives in the database. */
export const cases = sqliteTable("cases", {
  /** Human-facing reference, e.g. "UZ-2609-0001". */
  id: text("id").primaryKey(),
  /** One of PROCEDURE_IDS: 306 | 325 | 477 | 540 | 868. */
  procedureId: text("procedure_id").notNull(),
  title: text("title").notNull(),
  goods: text("goods").notNull().default(""),
  /** The chat message that opened the case, kept for traceability. */
  query: text("query").notNull().default(""),
  /** How the procedure was matched: "llm" | "rules" | "manual". */
  matchedBy: text("matched_by").notNull().default("rules"),
  /** active | blocked | complete */
  status: text("status").notNull().default("active"),
  /** JSON: { "<blockId>:<stepNum>": { provided: boolean, note?: string } }.
   *  The Document Intelligence agent's completeness checklist - which of the
   *  procedure's declared step outputs have been supplied for this shipment.
   *  A block cannot be marked done while a required output is missing. */
  documentState: text("document_state").notNull().default("{}"),
  shipmentFacts: text("shipment_facts").notNull().default("{}"),
  workflowRunId: text("workflow_run_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/* One row per block of the case's procedure, created when the case opens.
 * `actualHours` against the block's static estDuration is what lets the DAG
 * show expected-versus-actual rather than expected alone. */
export const caseBlocks = sqliteTable(
  "case_blocks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    caseId: text("case_id").notNull(),
    /** Block id within the procedure: "b1".."b15". */
    blockId: text("block_id").notNull(),
    /** waiting | blocked | running | done */
    state: text("state").notNull().default("waiting"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    actualHours: real("actual_hours"),
  },
  (t) => [index("case_blocks_case_idx").on(t.caseId)],
);

export type CaseRow = typeof cases.$inferSelect;
export type CaseBlockRow = typeof caseBlocks.$inferSelect;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  capabilities: text("capabilities").notNull().default("[]"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("users_email_uidx").on(t.email)]);

export const entities = sqliteTable("entities", {
  id: text("id").primaryKey(),
  canonicalName: text("canonical_name").notNull(),
  type: text("type").notNull(),
  capabilities: text("capabilities").notNull().default("[]"),
  contact: text("contact").notNull().default("{}"),
  simulationMode: integer("simulation_mode", { mode: "boolean" }).notNull().default(true),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("entities_name_uidx").on(t.canonicalName)]);

export const procedureVersions = sqliteTable("procedure_versions", {
  id: text("id").primaryKey(),
  procedureId: text("procedure_id").notNull(),
  version: integer("version").notNull(),
  status: text("status").notNull().default("draft"),
  title: text("title").notNull(),
  definition: text("definition").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("procedure_version_uidx").on(t.procedureId, t.version)]);

export const workflowRuns = sqliteTable("workflow_runs", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull(),
  procedureVersionId: text("procedure_version_id").notNull(),
  status: text("status").notNull().default("running"),
  cycle: integer("cycle").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("workflow_runs_case_uidx").on(t.caseId)]);

export const workflowNodes = sqliteTable("workflow_nodes", {
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
  optional: integer("optional", { mode: "boolean" }).notNull().default(false),
  state: text("state").notNull().default("waiting"),
  assignedUserId: text("assigned_user_id"),
  assignedEntityId: text("assigned_entity_id"),
  input: text("input").notNull().default("{}"),
  output: text("output").notNull().default("{}"),
  attempts: integer("attempts").notNull().default(0),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
}, (t) => [index("workflow_nodes_run_idx").on(t.runId), uniqueIndex("workflow_node_step_uidx").on(t.runId, t.blockId, t.stepNum)]);

export const workflowEdges = sqliteTable("workflow_edges", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id").notNull(),
  fromNodeId: text("from_node_id").notNull(),
  toNodeId: text("to_node_id").notNull(),
  reason: text("reason").notNull(),
}, (t) => [index("workflow_edges_run_idx").on(t.runId)]);

export const workItems = sqliteTable("work_items", {
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
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
}, (t) => [uniqueIndex("work_items_node_uidx").on(t.nodeId), index("work_items_run_idx").on(t.runId)]);

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  nodeId: text("node_id").notNull(),
  agentName: text("agent_name").notNull(),
  attempt: integer("attempt").notNull(),
  status: text("status").notNull(),
  input: text("input").notNull().default("{}"),
  output: text("output").notNull().default("{}"),
  error: text("error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
}, (t) => [uniqueIndex("agent_runs_attempt_uidx").on(t.nodeId, t.attempt), index("agent_runs_run_idx").on(t.runId)]);

export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  nodeId: text("node_id"),
  type: text("type").notNull(),
  name: text("name").notNull(),
  data: text("data").notNull().default("{}"),
  simulated: integer("simulated", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("artifacts_run_idx").on(t.runId)]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  nodeId: text("node_id"),
  eventType: text("event_type").notNull(),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id"),
  data: text("data").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("audit_events_run_idx").on(t.runId)]);
