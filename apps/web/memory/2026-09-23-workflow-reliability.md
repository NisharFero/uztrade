# Debug report: workflow and document request reliability

Status: DONE_WITH_CONCERNS

## Symptoms

- A specialist request could outlive the 60 second function and strand its node in `running`.
- Concurrent requests could both act on a ready node or complete the same work item.
- Run creation wrote several tables without a transaction.
- Document reads could wait 240 seconds inside a 60 second route, and a parse failure could leave an unreferenced upload.
- Refreshing the chat lost the unconfirmed intake draft.
- Every cold isolate re-upserted the catalog.

## Root causes

The specialist fetch had no abort signal. The orchestrator wrote `running` before awaiting it, while reconciliation only promoted `waiting` nodes. The persisted repository updated states without checking their previous values. `createRun` used independent statements. Document storage happened before parsing, and DocAI's timeout exceeded the route limit. Chat sessions persisted messages but omitted the intake turn. Catalog bootstrap always wrote every seed row.

## Fixes

- Bound Groq specialist calls to 12 seconds and keep the deterministic fallback. Claim agent nodes with a conditional state update, recover stale specialist claims after 50 seconds, and cap each orchestrator pass at 45 seconds.
- Claim portal filings before the external call, bound portal review syncing, and compare-and-swap work item completion.
- Use a local Postgres transaction or a Neon HTTP batch transaction for the run, nodes, edges, and case link.
- Bound DocAI to 35 seconds, use a shared vision/fallback budget, pass request deadlines into orchestration, and report pack files deferred by the route budget.
- Parse before writing the blob; compensate by deleting the upload when the ledger write fails and no document record exists.
- Persist the unfinished intake turn with the browser chat session and restore its confirmation action.
- Read catalog rows first and upsert only missing or changed seeds.
- Add deterministic router phrase variants to the existing tests.

## Evidence

- `node node_modules/typescript/bin/tsc --noEmit --incremental false` passed.
- `npm run test:unit` passed 246/246 tests. Focused document, portal, and orchestrator tests passed again after the final upload cleanup change.
- Local Postgres integration test forced a duplicate-node insert, confirmed no run/nodes/edges or case link remained, then retried successfully with the same run ID.
- Local web and portal health checks returned HTTP 200.

## Remaining limits

- Neon batch atomicity follows the installed driver's implementation but was not exercised against a live Neon database.
- A process killed after a blob write but before a ledger write cannot execute compensation; such blobs need periodic storage reconciliation for a strict zero-orphan guarantee.
- Initial `createCase` and its block rows are still outside the workflow transaction, so a case can exist without a run if workflow creation fails.
- The entity portal service has a Render blueprint, but production use still depends on `PORTALS_URL` being configured in the web deployment.
