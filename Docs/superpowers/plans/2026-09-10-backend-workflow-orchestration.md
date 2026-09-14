# UzTrade Backend Workflow Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a backend-only, durable workflow engine that instantiates authoritative procedure steps, auto-runs Agent work with LangGraph, and pauses/resumes User and Physical work through mock APIs.

**Architecture:** D1 stores versioned procedures and workflow projections. Pure domain functions derive step dependencies and transitions; a generic LangGraph control loop delegates ready nodes to specialist executors or persisted work items. Thin route handlers expose catalog, workflow, and compatibility APIs.

**Tech Stack:** TypeScript, Vinext/Next route handlers, Cloudflare D1, Drizzle ORM, LangGraph.js, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-10-backend-workflow-orchestration-design.md`

## Global Constraints

- Do not modify UI, CSS, navigation, or client components.
- Procedure templates are authoritative; model output cannot change steps or dependencies.
- Agent work auto-completes; User and Physical work requires explicit mock completion.
- Persist resumable workflow state in D1, not Worker memory.
- Preserve existing `/api/query` and `/api/cases/[id]` contracts.
- The workspace is not a Git repository, so commit steps are replaced by verification checkpoints.

---

### Task 1: Domain Workflow Engine

**Files:**
- Create: `apps/web/app/domain/workflow.ts`
- Create: `apps/web/tests/workflow-domain.test.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: `Procedure` and `delegationOfStep` from existing data modules.
- Produces: `extractShipmentFacts(query)`, `validateProcedure(procedure)`, `instantiateWorkflow(procedure)`, `reconcileNodes(nodes)`, and typed workflow records.

- [ ] Write tests proving shipment extraction, cycle rejection, step ordering, block dependency mapping, and lane delegation.
- [ ] Run `npx tsx --test tests/workflow-domain.test.ts` and confirm failures because the domain module is missing.
- [ ] Implement the pure domain functions with deterministic IDs and transitions.
- [ ] Re-run the domain tests and confirm they pass.

### Task 2: Persistent Schema And Seed Catalog

**Files:**
- Modify: `apps/web/db/schema.ts`
- Create: `apps/web/drizzle/0002_workflow_backend.sql`
- Create: `apps/web/app/lib/backend-seed.ts`
- Create: `apps/web/tests/backend-seed.test.ts`

**Interfaces:**
- Consumes: existing generated procedures and distinct step entities.
- Produces: tables for users, entities, procedure versions, workflow runs/nodes/edges, work items, agent runs, artifacts, audit events, plus `mockUsers()`, `mockEntities()`, and `procedureSeeds()`.

- [ ] Write tests asserting stable seeded users, normalized unique entities, and all five procedure versions.
- [ ] Run the seed test and confirm it fails because the seed module is missing.
- [ ] Add Drizzle declarations, SQL migration, and deterministic seed generation.
- [ ] Re-run seed and domain tests.

### Task 3: Repository And Workflow Service

**Files:**
- Create: `apps/web/app/lib/workflow-repository.ts`
- Create: `apps/web/app/lib/workflow-service.ts`
- Create: `apps/web/tests/workflow-service.test.ts`

**Interfaces:**
- Consumes: domain workflow records, D1 tables, classification result, and seed catalog.
- Produces: `createWorkflowCase`, `getWorkflowProjection`, `listWorkItems`, `completeWorkItem`, `resumeWorkflow`, and a repository interface with an in-memory implementation for tests.

- [ ] Write an in-memory service test proving Agent nodes auto-complete, User/Physical nodes pause, a completion resumes downstream work, and repeated completion is rejected.
- [ ] Run the test and confirm the missing service failure.
- [ ] Implement repository contracts and transactional D1 adapter.
- [ ] Implement case creation, projection, work-item completion, and audit recording.
- [ ] Re-run service tests.

### Task 4: LangGraph Orchestrator And Specialists

**Files:**
- Create: `apps/web/app/agents/orchestrator.ts`
- Create: `apps/web/app/agents/specialists.ts`
- Create: `apps/web/tests/orchestrator.test.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/package-lock.json`

**Interfaces:**
- Consumes: repository interface and workflow transition functions.
- Produces: `runOrchestrator(repository, runId)` and structured specialist outputs for documents, compliance, inspection scheduling, and generic simulated execution.

- [ ] Write tests proving specialist selection, automatic progress to the first external wait, deterministic inspection booking, and no duplicate Agent run.
- [ ] Run the tests and confirm the missing orchestrator failure.
- [ ] Install `@langchain/langgraph`, `@langchain/core`, `zod`, and `tsx`.
- [ ] Implement a generic `StateGraph` load/evaluate/execute loop and deterministic specialists.
- [ ] Re-run orchestrator and service tests.

### Task 5: Backend APIs

**Files:**
- Create: `apps/web/app/api/users/route.ts`
- Create: `apps/web/app/api/users/[id]/route.ts`
- Create: `apps/web/app/api/entities/route.ts`
- Create: `apps/web/app/api/entities/[id]/route.ts`
- Create: `apps/web/app/api/procedures/route.ts`
- Create: `apps/web/app/api/procedures/[id]/route.ts`
- Create: `apps/web/app/api/workflows/[id]/route.ts`
- Create: `apps/web/app/api/workflows/[id]/run/route.ts`
- Create: `apps/web/app/api/work-items/route.ts`
- Create: `apps/web/app/api/work-items/[id]/complete/route.ts`
- Create: `apps/web/app/api/agent-runs/route.ts`
- Create: `apps/web/app/api/artifacts/route.ts`
- Create: `apps/web/app/api/audit-events/route.ts`
- Modify: `apps/web/app/api/query/route.ts`
- Modify: `apps/web/app/api/cases/[id]/route.ts`
- Create: `apps/web/app/lib/http.ts`

**Interfaces:**
- Consumes: workflow service and repositories.
- Produces: validated JSON APIs with stable 400/404/409/422/500 responses while retaining existing response shapes.

- [ ] Add route-contract assertions to `tests/rendered-html.test.mjs` for route presence and compatibility.
- [ ] Run the test and confirm new route assertions fail.
- [ ] Implement thin handlers and common error mapping.
- [ ] Adapt compatibility routes without changing their client-visible fields.
- [ ] Re-run tests.

### Task 6: Full Verification

**Files:**
- Modify only backend or test files if verification reveals defects.

**Interfaces:**
- Consumes: completed backend.
- Produces: verified build and API/domain behavior.

- [ ] Run `npm test` and fix backend regressions through failing tests first.
- [ ] Run `npm run lint` and resolve new errors or warnings.
- [ ] Run `npx tsc --noEmit` and distinguish new failures from documented Cloudflare type gaps.
- [ ] Confirm no files under `app/components`, `app/cases`, `app/*.css`, or `app/nav.tsx` changed.
