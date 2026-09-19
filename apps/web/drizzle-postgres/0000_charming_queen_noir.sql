CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"node_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"attempt" integer NOT NULL,
	"status" text NOT NULL,
	"input" text DEFAULT '{}' NOT NULL,
	"output" text DEFAULT '{}' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"node_id" text,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"data" text DEFAULT '{}' NOT NULL,
	"simulated" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"node_id" text,
	"event_type" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"data" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"block_id" text NOT NULL,
	"state" text DEFAULT 'waiting' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"actual_hours" real
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" text PRIMARY KEY NOT NULL,
	"procedure_id" text NOT NULL,
	"title" text NOT NULL,
	"goods" text DEFAULT '' NOT NULL,
	"query" text DEFAULT '' NOT NULL,
	"matched_by" text DEFAULT 'rules' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"document_state" text DEFAULT '{}' NOT NULL,
	"shipment_facts" text DEFAULT '{}' NOT NULL,
	"workflow_run_id" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" text PRIMARY KEY NOT NULL,
	"canonical_name" text NOT NULL,
	"type" text NOT NULL,
	"capabilities" text DEFAULT '[]' NOT NULL,
	"contact" text DEFAULT '{}' NOT NULL,
	"simulation_mode" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procedure_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"procedure_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"definition" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"capabilities" text DEFAULT '[]' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_items" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"node_id" text NOT NULL,
	"lane" text NOT NULL,
	"assignee_user_id" text,
	"entity_id" text,
	"state" text DEFAULT 'open' NOT NULL,
	"request" text DEFAULT '{}' NOT NULL,
	"result" text DEFAULT '{}' NOT NULL,
	"completed_by" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "workflow_edges" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"from_node_id" text NOT NULL,
	"to_node_id" text NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"block_id" text NOT NULL,
	"block_name" text NOT NULL,
	"step_num" integer NOT NULL,
	"title" text NOT NULL,
	"output_name" text DEFAULT '' NOT NULL,
	"entity_name" text NOT NULL,
	"channel" text NOT NULL,
	"lane" text NOT NULL,
	"delegation_reason" text NOT NULL,
	"optional" boolean DEFAULT false NOT NULL,
	"state" text DEFAULT 'waiting' NOT NULL,
	"assigned_user_id" text,
	"assigned_entity_id" text,
	"input" text DEFAULT '{}' NOT NULL,
	"output" text DEFAULT '{}' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"procedure_version_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"cycle" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_attempt_uidx" ON "agent_runs" USING btree ("node_id","attempt");--> statement-breakpoint
CREATE INDEX "agent_runs_run_idx" ON "agent_runs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "artifacts_run_idx" ON "artifacts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "audit_events_run_idx" ON "audit_events" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "case_blocks_case_idx" ON "case_blocks" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entities_name_uidx" ON "entities" USING btree ("canonical_name");--> statement-breakpoint
CREATE UNIQUE INDEX "procedure_version_uidx" ON "procedure_versions" USING btree ("procedure_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uidx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "work_items_node_uidx" ON "work_items" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "work_items_run_idx" ON "work_items" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "workflow_edges_run_idx" ON "workflow_edges" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "workflow_nodes_run_idx" ON "workflow_nodes" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_node_step_uidx" ON "workflow_nodes" USING btree ("run_id","block_id","step_num");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_runs_case_uidx" ON "workflow_runs" USING btree ("case_id");