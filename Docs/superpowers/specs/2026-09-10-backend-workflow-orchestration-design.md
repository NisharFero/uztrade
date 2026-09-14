# UzTrade Backend Workflow Orchestration Design

## Goal

Build a production-shaped backend for UzTrade that turns a shipment query into
a durable workflow run based on one authoritative, versioned procedure. The
backend classifies and extracts shipment facts, instantiates every published
procedure step, delegates each step to Agent, User, or Physical work, executes
eligible Agent work automatically, and waits for mock inputs for User and
Physical work before resuming.

This change is backend-only. Existing UI, CSS, navigation, and client
components are out of scope and must not be edited.

## Constraints And Decisions

- The selected procedure is authoritative. An LLM may classify a query,
  extract facts, and explain decisions, but cannot add, remove, reorder, or
  bypass procedure steps.
- The first release supports one organization. Users are internal operators;
  entities are external counterparties or physical service providers.
- External customs, banking, certification, and inspection integrations are
  simulated. Simulation is explicit in every result and audit event.
- Agent execution is automatic. User and Physical work pauses until a mock
  completion API is called.
- D1 is the durable source of truth. LangGraph.js provides the orchestration
  control loop; workflow state is reloaded from D1 for each invocation.
- Built-in in-memory LangGraph checkpointing is not used because Cloudflare
  Worker isolates are ephemeral. Domain state and resumability are persisted
  in D1 instead.
- Existing `/api/query` and `/api/cases/[id]` behavior remains compatible with
  the current UI.

## Domain Model

### Users

Internal operators who own User-lane work. A user has an ID, display name,
email, role, active state, and capabilities. Initial mock users cover trader,
compliance reviewer, finance approver, and operations coordinator roles.

### Entities

External organizations or facilities involved in procedure steps. An entity
has an ID, canonical name, type, capabilities, contact data, and simulation
state. Seed data is derived from the procedure dataset's distinct entity names
and normalized into government, bank, transport, inspection, certification,
and facility categories.

### Procedure Versions

An immutable published template stores the complete procedure definition as
validated JSON. It includes blocks, ordered steps, dependencies, expected
duration, required outputs, channels, and entity names. Publishing rejects
duplicate IDs, missing dependency targets, and cyclic graphs. Existing five
procedures are seeded as version 1. New versions do not mutate existing runs.

### Cases And Workflow Runs

A case stores the raw query and extracted shipment facts: goods, quantity,
unit, origin, destination, direction, and transport mode. A workflow run pins
the case to one procedure version and records its lifecycle status.

Each procedure step becomes a workflow node. Nodes retain their block ID,
step number, title, delegation lane, delegation reason, assigned user or
entity, state, input, output, timestamps, and retry metadata. Published block
dependencies are preserved. Steps inside a block execute in published numeric
order; the first step waits for predecessor blocks and each later step waits
for the preceding step in the same block.

Node states are `waiting`, `ready`, `running`, `needs_input`, `completed`,
`failed`, and `skipped`. A transition is valid only when all predecessor nodes
are complete and the transition matches the node's current state.

### Work, Runs, Artifacts, And Audit

- Work items expose User or Physical actions and their mock input contracts.
- Agent runs record specialist, attempt, input, output, status, and errors.
- Artifacts record simulated documents, extraction results, compliance
  assessments, and inspection bookings.
- Audit events append every classification, delegation, state transition,
  completion, retry, and error. Audit rows are immutable.

## LangGraph Orchestration

The orchestration graph is generic rather than compiled per procedure:

1. Load the workflow projection from D1.
2. Reconcile nodes whose dependencies are now complete.
3. Select all ready nodes in deterministic order.
4. Route Agent nodes to a specialist and User/Physical nodes to work-item
   creation.
5. Persist specialist output or the input request.
6. Repeat while an Agent node can make progress.
7. Stop when the run is complete, needs external input, or has failed.

Agent specialists are:

- Document Intelligence: validates required outputs and produces amendment
  requirements when fields or artifacts are missing.
- Compliance And Risk: creates a structured HS suggestion, duty disclaimer,
  and procedure-derived risk flags.
- Inspection Scheduler: creates a deterministic mock appointment and assigns
  the relevant physical entity.
- Procedure Executor: produces explicit simulated results for other eligible
  Agent-lane portal and retrieval steps.

The Orchestrator owns routing and transitions. Specialists cannot modify
dependencies or directly complete unrelated nodes. Every invocation uses a
run-scoped lock/idempotency record so concurrent resumes do not execute a node
twice.

## API Surface

### Cases And Workflows

- `POST /api/cases`: validate a shipment query, classify it, extract facts,
  create a case and workflow run, then run orchestration until blocked.
- `GET /api/cases`: list cases with workflow summaries.
- `GET /api/cases/:id`: return the case, workflow nodes, work items, artifacts,
  agent runs, and audit events.
- `POST /api/workflows/:id/run`: idempotently resume or retry orchestration.
- `GET /api/workflows/:id`: return the complete workflow projection.

### Work Items

- `GET /api/work-items`: filter by assignee, entity, lane, case, and state.
- `POST /api/work-items/:id/complete`: validate mock input, complete exactly
  once, and resume the owning workflow.

### Catalog And Actors

- CRUD APIs under `/api/users` and `/api/entities`.
- Read/create/version/publish APIs under `/api/procedures`.
- Read APIs for `/api/agent-runs`, `/api/artifacts`, and `/api/audit-events`.

Existing `POST /api/query` delegates internally to the new case creation
service and keeps its current response shape. Existing case GET/PATCH routes
remain compatible; their completion actions are translated into work-item or
workflow operations where possible.

## Validation And Error Handling

Request bodies are parsed through schemas before reaching services. Domain
services return typed errors mapped to stable HTTP responses: 400 invalid
input, 404 missing resource, 409 invalid transition or duplicate completion,
422 unpublished/invalid procedure, and 500 unexpected failure.

Writes that create a case or transition workflow state are atomic D1 batches.
Idempotency keys protect case creation, workflow invocation, agent execution,
and work-item completion. Failed Agent nodes retain their attempt record and
can be retried without replaying successful predecessors.

## Backend Structure

- `db/schema.ts`: tables and inferred row types.
- `app/domain/`: schemas, domain types, errors, and transition rules.
- `app/repositories/`: D1 persistence only.
- `app/services/`: use cases for cases, catalog, actors, work items, and
  workflow projections.
- `app/agents/`: LangGraph builder, orchestrator, specialist nodes, and
  deterministic mock tools.
- `app/api/`: thin HTTP adapters.
- `scripts/`: seed generation for procedures, users, and entities.

No route contains orchestration or SQL logic. Agent nodes call services and
repositories through explicit interfaces so orchestration tests can run with
an in-memory repository.

## Testing

- Unit tests for procedure validation, shipment extraction fallback,
  delegation, transition rules, specialist routing, and mock tools.
- Repository tests for seed idempotency and projection queries.
- Orchestration tests proving dependency order, parallel readiness,
  automatic Agent completion, User/Physical pauses, resume, retries, and
  terminal completion.
- API tests for validation, compatibility routes, idempotency, and typed
  errors.
- Existing build, lint, and rendered HTML tests must continue to pass without
  frontend changes.

## Deferred Work

Real external integrations, file uploads and OCR, authoritative tariff data,
notifications, billing, multi-organization tenancy, and frontend surfaces for
the new APIs are deferred until their infrastructure and product requirements
exist.
