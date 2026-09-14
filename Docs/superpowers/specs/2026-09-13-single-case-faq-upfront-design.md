# One Case at a Time, FAQ, Export/Import Slot and Upfront Inputs — Design

Status: approved 2026-09-13.

## Decisions (user)
- The full workflow (DAG, documents, risk, ledger) of the case lives on the
  procedure's page; Cases & Shipments (page and nav item) is removed.
- Agent steps run automatically; the trader's steps stay one click.
- All existing cases, workflow state, ledger entries and uploaded originals are
  deleted to start fresh (users, entities, procedures kept).

## 1. One case at a time
- `lib/active-case.ts`: `activeCase()` (latest case not complete),
  `latestCaseFor(procedureId)`, `resetAllCases(bucket)`.
- `POST /api/intake {confirm:true}` → 409 with the open case while one is open.
- Dashboard loads the active case; its current step is always in the chat.
- `POST /api/admin/reset {"confirm":"delete all cases"}` performs the reset.

## 2. Intake: Export / Import slot
Order: What → Export/Import → How → How much → From/To → confirm.
- Directions offered only where published (tea: both; dried fruit, fresh
  produce: export only, stated not asked).
- A complete route implies the direction when none was chosen.
- A chosen direction the route contradicts is asked again; a route in a
  direction no procedure covers is refused.

## 3. FAQ
- `lib/faq.ts` (entries built from the app's data) and `/faq?q=`; closest
  answers to the query first and open.
- The chat navigates to `/faq?q=…` when intake declines a query as not a
  shipment. FAQ replaces Cases & Shipments in the nav.

## 4. Upfront inputs
Rule: an input qualifies if (1) no earlier step produces it and (2) the trader
already holds or issues it at the start.
- `lib/steps/upfront.ts` builds the plan from the step engine's needs; a reason
  table lists inputs that are trader-supplied on paper but come out of the
  procedure (offer amounts, agreements concluded during it, provider invoices,
  portal applications, assembled packages, route-specific letters, outputs).
- Upfront values and documents are recorded at step 0; later steps read them
  from the ledger (`autoFilled`), and an agent step that only waited on them
  runs without pausing. Confirmations of acts stay per step.
- The step assistant shows "Before you start" with each upfront item (upload /
  value / demo) and the "Later, and why" list.

## Testing
- Intake conversation tests updated for the direction slot; conflict test.
- Upfront: 868 classification and reasons; an invoice given at step 0 lets
  step 41 complete without an `agent_paused` event.
- FAQ matching; 409 on a second case; reset endpoint; browser check of chat →
  FAQ redirect, one-case block, procedure page workflow.
