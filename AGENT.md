# AGENT.md

Working notes for the UzTrade agent workspace: what was asked, what was built,
how it was verified, and the decisions that are load-bearing. Written for
whoever picks this up next — human or agent.

---

## 1. What this application is

A case workspace for Uzbek trade procedures. A trader describes a shipment in
chat; the system matches it to one of five published procedures, opens a case,
and renders the procedure as a dependency graph showing **who has to do each
step** — the trader, an automated agent, or physical handling of the goods.

**Scope is exactly five procedures.** Anything else is refused by name.

| ID | Procedure | Blocks | Steps | Published |
|---|---|---|---|---|
| 306 | Export of dried fruits by train | 10 | 48 | 81–241 h |
| 325 | Export of fresh fruits and vegetables by train | 10 | 48 | 81–241 h |
| 477 | Import of tea by train | 15 | 53 | 34–183 h |
| 540 | Export of tea by air | 9 | 47 | 30–108 h |
| 868 | Export of tea by train | 10 | 48 | 81–244 h |

Totals: **54 blocks, 244 steps, 25 distinct entities.**

---

## 2. Instructions followed, in the order they were given

The brief arrived incrementally and changed direction more than once. Recording
the sequence because several decisions only make sense against it.

1. **Restyle the UI** — no blue, "Claude-style" fonts and surfaces.
2. **Reverse** — blue theme after all; then *dark blue* sidebar with white
   hover pills, white main workspace.
3. **Run it with UI checks** — drive the real app, not the test suite.
4. **Make the workflow architectural** — explain process state; survey what
   orchestration tools and consulting practice would add.
5. **Use the real data** — five procedures from `Docs/Procedures/*.docx`, build
   Cases & Shipments, Procedures, and Agent Center pages; plan before building.
6. **Correct the lane model** — delegate to **User / Agent / Physical only**.
   Agents cannot do everything: Document Intelligence extracts and checks
   completeness then asks for amendments; Compliance & Risk does HS codes,
   duty, and risk; an Orchestrator delegates and schedules inspections.
7. **Reason each step realistically** — `bank: pay` is always the user;
   `apply: online` is only the agent **if the agent actually has access to
   that portal**. Workflow below the chat; all cases under Cases & Shipments;
   use the LLM key in `apps/.env`.

A reference spec (`Agentic_Platform__ADPG_EcoSystem_and_AD_Customs.pdf`,
FERO.ai for Abu Dhabi Ports Group) was supplied as context and settled three
open questions — see §6.

---

## 3. What was built

### Data foundation
- `apps/web/scripts/build-procedures.mjs` → `modules/procedures/data/procedures.generated.ts`
  (4,779 lines, committed). Regenerate with `npm run data:build`.
- **The `.docx` files were deliberately not re-parsed.** They are 2–7 MB each
  and the structure — blocks, `dependsOn` edges, `estDuration` ranges,
  `dependencyReason` prose, per-step entity/channel/output — had already been
  extracted into `scripts/data/dag-data.json`. Re-parsing would have been slower and
  strictly worse.

### The delegation model — the heart of it
`modules/procedures/delegation.ts`. `performedBy` is blank on **226 of 244 steps**, so
the executor is derived. Three questions, in order:

1. **Does the goods have to be there?** In-person + a physical verb
   (`undergo`, `load`, `seal`, `sample`, `fumigate`, `dispatch`) → **Physical**.
   Gated to in-person so "Obtain offer agreement for *fumigation*" (an online
   document) doesn't get miscounted as the act itself.
2. **Is it money, or does it commit the company?** `Online: pay`, concluding an
   agreement, accepting a public offer, submitting a signed declaration →
   **User**. The agent prepares these; it does not commit them.
3. **Does the platform have access to that portal?**
   - Integrated: One-stop Single Window, Uzbekistan railways SW, Uzbekexpertiza
     portal, Assalom Agro, customs cabinet (ED1) → **Agent**.
   - Identity-bound: my.gov.uz (e-signature), quarantine *personal* cabinet
     (Oferta), bank → **User**.

Result: **User 151 · Agent 47 · Physical 46** — agent-executed is **19%** of
steps, not the 32% a naive "online ⇒ agent" rule produced.

The clearest illustration, block b9 of 325 — one portal, three answers:

```
41  Create export customs declaration    Online: apply   → AGENT     routine draft
42  Pay for customs fee                  Online: pay     → USER      account holder
43  Submit export customs declaration    Online: submit  → USER      signed legal act
44  Undergo customs inspection           In person       → PHYSICAL  goods present
45  Obtain export customs declaration    Online: obtain  → AGENT     retrieval
46  Obtain stamps on shipping documents  In person       → USER      attendance
```

### Column assignment (not a majority vote)
`blockColumn()` orders by **how binding the constraint is**:
`Physical > Agent > User`. Majority-vote was tried and **failed** — because
User is the default sink for in-person admin, procedure 325 collapsed into a
single column with `Handoffs = 0`. The priority rule gives each column a
meaning: *needs the goods* / *partly automatable* / *entirely on you*. Finer
detail lives in a per-node lane-mix bar and per-step badges.

### The three agents
| Agent | File | What it actually does |
|---|---|---|
| **Document Intelligence** | `lib/document-intelligence.ts`, `modules/documents/agent-tasks.ts` | Tracks each block's declared step outputs and **verifies them itself** as soon as the producing step completes — persisted via `provide-output`, never asked of the trader. The server still refuses to complete a block with a required output outstanding (HTTP 409); the case board satisfies it by verifying the block's documents first. Panel lists every document by block: unticked / spinner / tick. |
| **Compliance & Risk** | `modules/compliance/compliance.ts`, `modules/documents/agent-tasks.ts` | HS heading suggestion and risk flags derived from what the procedure requires. Runs by itself at case open — no confirm button — then checks each customs filing/fee step. **No duty rate is shown**: without Uzbekistan's tariff schedule any % would be invented, so `CAPABILITY_GAPS` states the gap instead. |
| **Orchestrator** | `data/delegation.ts` + `lib/dag.ts` | Assigns each block its lane *and states why*; readiness rule gates scheduling — a block is Ready only when **every** dependency is done. |

### Shipment plan — quantity and distance
`modules/intake/shipment-plan.ts` (pure, tested in `tests/unit/intake/shipment-plan.test.ts`). The
published procedures cover the paperwork for one consignment and stop at
dispatch; a casual query ("export 60 tonnes of tea from Tashkent to Moscow")
now drives:

- **Quantity → units.** Tonnes → covered wagons (~30 t tea, 45 t dried fruit,
  22 t refrigerated produce — volume-limited) or 3.5 t air pallets. Only blocks
  that touch the goods stretch per extra unit (loading +2–4 h, sampling /
  inspection +1–2 h); paperwork and dispatch do not. Small loads → groupage
  note; air over belly/freighter capacity → flagged.
- **Distance → transit.** A ~75-city gazetteer (aliases, bare country names →
  hub) + great-circle × route factor; per-country rail corridors give transit
  countries, borders, gauge breaks (CN / IR / EU) and sea or road legs. Rail
  250–450 km/day + 12–36 h per border; air 750 km/h + handling.
- **Mode when unstated.** Tea export exists by air (540) and train (868); with
  no mode in the query the load picks it (`chooseModeByLoad` in
  `modules/intake/classify.ts`) — ≥2 t → train, smaller and far → air. A stated mode is
  never overridden. The LLM prompt was told a missing mode is fine, and a
  refusal on a mode-less query falls back to the rules.
- **Surface.** `components/shipment-plan.tsx`, above the workflow on the case
  page and under the chat. Every figure is labelled a planning assumption.

### Aligned with the architecture brief (small, deliberate changes)
- **Intake never silently guesses** (`settleMatch` in `modules/intake/classify.ts`). The
  classifier proposes; the trader's words are checked: a stated direction/mode
  no procedure covers is refused plainly; if two directions still fit, ONE
  question is asked with answer chips; if two modes fit, the load decides, or
  — with no quantity — the mode is asked. Direction is also read off the route
  (leaving Uzbekistan = export).
- **Actions, not just lanes** (`actionOfStep` in `data/delegation.ts`): sign /
  pay / submit / attend / at the goods / decide / agent runs, each with what the
  agent does for it. The current-step button uses the act's verb.
- **Payments = reference + receipt only.** Pay steps show a platform payment
  reference (`<case>-P<step>`); moving money waits for a payment connector.
- **Case ledger** (`components/case-ledger.tsx`): the engine's append-only
  `audit_events`, newest first.
- **Known tension:** the brief says per-step times shouldn't be fabricated; the
  block `estDuration` ranges and the shipment plan's per-wagon/transit
  allowances are planning assumptions, labelled as such, not entity SLAs.

### Backend
- **D1 + Drizzle.** `.openai/hosting.json` `d1: "DB"`; schema in `db/schema.ts`
  (`cases`, `case_blocks`); two migrations in `drizzle/`.
- `db/migrate.ts` applies `drizzle/*.sql` via Vite's `import.meta.glob` — one
  source of truth, no hand-copied DDL. Idempotent: "already exists" and
  "duplicate column" are swallowed, everything else rethrows.
- `POST /api/query` — classify → open case. `PATCH /api/cases/[id]` — two
  actions: `complete` (runs the completeness gate first) and `provide-output`.

### LLM classification
`modules/intake/classify.ts` — Groq, OpenAI-wire-compatible, model `openai/gpt-oss-20b`.
The returned id is **validated against the five known procedures** before use;
the model is never trusted raw. A deterministic keyword matcher remains as
fallback so the app works with no key and stays testable in CI.
`vite.config.ts` lifts `apps/.env` into the worker's `vars` because miniflare
does not read that path.

### Pages
`/` dashboard (chat → workflow renders **below** it) · `/procedures` ·
`/procedures/[id]` (template, or the live case's whole workflow) · `/faq` · `/demo/[procedureId]` · `/agents` · `/entities`. Cases & Shipments was removed on 2026-09-13.

### Intake, step needs and risk evidence (added 2026-09-13)
Spec: `Docs/superpowers/specs/2026-09-13-intake-docintel-risk-agents-design.md`.

- **Intake** (`modules/intake/classify.ts`, `modules/intake/`): relevance gate → slots →
  commodity table (`taxonomy.ts`) → lookup `(category, direction, mode)` →
  ask ONE missing slot (after two follow-ups: candidate procedures by title) →
  `StepPlan` (`plan.ts`: blocks, parallel tracks, lanes, decisions, per-step
  needs). **The table picks the procedure**; a model's id is a proposal and is
  overridden, with the rationale saying so. Bare "apricots / plums / figs /
  fruit" asks fresh or dried — 325 and 306 are otherwise the same skeleton.
- **Section 5 inputs** (`scripts/data/extract-inputs.mjs` → `scripts/data/inputs-data.json`
  → `step.inputs`, merged by `build-procedures.mjs`). The docx tags every line
  "[trader supplies]" and flattens structure; `modules/procedures/requirements.ts` re-derives
  kind (profile / identity / case / produced / published / presence), the
  producing step (nearest earlier output, plus an alias table), channel
  variants ("For physical payment" / "For online payment") and groups.
- **Document field checklists** (`modules/documents/specs.ts`): 14 types, each field
  tagged `procedure` or `reference` — the docx publishes specimen images, not
  field lists, so reference fields are never presented as the procedure's own.
- **Risk** (`modules/compliance/compliance.ts`): certificate rules keyed `commodity×direction`
  (868 vs 477 are disjoint); 8 inputs with why; `unresolved` names the
  conclusion each missing input blocks; every flag carries evidence with its
  producing step. Country notes are `advisory`.
- **Backend specialists** (`agents/specialists.ts`) use the same logic for
  published procedures: Document Intelligence records `amendmentsRequested`
  for inputs whose producing step hasn't completed; Compliance returns the real
  assessment. Unknown procedures keep the simulated stub.
- **Conversational intake** (`modules/intake/draft.ts`, `validate.ts`,
  `conversation.ts`, `POST /api/intake`; spec
  `Docs/superpowers/specs/2026-09-13-conversational-intake-design.md`). The chat
  gathers **what → how → how much → from/to**, each validated, then shows a
  confirm card; **no case exists until "Create case & steps"**. Modes are
  offered only from published procedures (tea: train either way, air export
  only; dried/fresh: train, stated not asked). Quantity limits: rail 1–5,000 t,
  air ≤ 500 t with warnings above 10 t / 100 t. Route: one end in Uzbekistan,
  the other in the supplied country fixture `modules/intake/data/countries.ts` (KZ, KG, TR,
  AF, RU, CN); the route decides direction and can send the trader back to the
  mode question (tea from China by air). The draft is client-held and
  re-parsed server-side every turn; no model call in this path. `/api/query`
  remains the one-shot endpoint.
- **Source facts that contradict intuition:** the phytosanitary certificate and
  certificate of origin are "not obligatory to submit for export declaration"
  in four procedures (the declaration only waits on the railway bill and the
  contract ID); 325's alternative pair is steps 27/31, not 26/27.

### Step assistant, document AI, risk values and demo pack (added 2026-09-13)
Spec: `Docs/superpowers/specs/2026-09-13-step-assistant-docai-risk-design.md`;
research: `Docs/research/2026-09-13-document-specimens-rnd.md`.

- **Where things live.** The dashboard runs intake, then the chat becomes the
  **step assistant** (one step at a time). The full workflow (DAG, Document
  Intelligence, Risk & Compliance, ledger) is on the procedure page
  (`/procedures/[id]` shows the latest case for that procedure). Block "mark done" is gone —
  every completion goes through the gated step API.
- **Engine** (`modules/steps/`): the case ledger is artifacts (`trader_input`,
  `uploaded_document`, latest version wins). `next.ts` derives each step's
  needs (earlier-step output, document, value, confirmation, channel choice,
  the step's own output). An agent step missing trader inputs **pauses**
  (`agent_inputs` work item) and resumes by itself once they exist; a trader
  step can't complete while anything is missing (HTTP 422 with the list).
  KPIs: steps, agent steps, ETA from remaining block estimates, time saved =
  45 min × agent steps + 1 min × auto-filled values (formula shown).
- **Document AI** (`apps/docai`, FastAPI on :8765; start with `run.sh`):
  EasyOCR ru+en → `impira/layoutlm-document-qa` questions + bilingual label
  anchors → candidates. The app (`modules/documents/docai/`) validates by field kind, gates
  (≥0.80 accepted, 0.50–0.80 review, <0.50 missing) and cross-checks against
  intake and the ledger. Originals go to R2 (`DOCS`). Measured findings are in
  `apps/docai/README.md`; the ones that changed the code: cap pages at 1280 px
  (same accuracy, a third of the OCR time), flag unreadable pages (text under
  11 px **and** OCR confidence under 0.35) instead of parsing junk, correct
  zero-read-as-"О" in numbers, scale LayoutLM scores by page OCR confidence,
  pick the earliest printed title for the type, never let one company answer
  two counterparty fields, pair each receipt with the bill since the previous
  payment. Blank forms: 0 of 63 fields wrongly accepted.
- **Evaluation**: `npm run eval:docai` (published specimens — most are ~550 px
  thumbnails and correctly come back "unreadable"), `… -- --demo` (the demo
  pack). Speed on this i5 CPU: ~20–40 s OCR plus ~2 s per field question.
- **Risk & Compliance** (`modules/compliance/risk.ts`, `/api/cases/[id]/risk`): rows of
  title · value · reason computed from intake, route, country fixture, workflow
  state and parsed documents; no generic explanations, no invented duty.
- **Demo pack (868 only)**: `modules/demo/data/scenario-868.json` is the single
  source; `apps/docai/demo/generate_868.py` renders 38 readable DEMO-bannered
  pages into `public/demo/868/`; `modules/demo/demo.ts` maps each step need to its demo
  ("Use demo value" / "Use demo document" in the assistant — documents go
  through the real parser); `/demo/868` lists every file for download.
  Limitation: values are case-wide by label, so the one "Payment sum" is reused
  for every offer agreement.

---

## 4. Technical process used

**Tools.** Bash (`grep`/`sed`/`node -e` for inspection and surgical edits),
Read/Write/Edit for structured source, PowerShell for Windows process control
(stopping dev servers by port), and **Playwright driving headless Chromium**
for every UI claim.

**Verification discipline — the part that mattered most.** Nothing was reported
working on the strength of a clean build. Each change was driven in a real
browser and asserted on computed values, not screenshots alone. That is how
these were caught:

| Found by | Bug |
|---|---|
| `document.fonts` check | **No webfont had ever loaded.** vinext emits absolute disk paths for `next/font`; browsers block them as `file://`. Every font choice in the project was rendering as fallback. Fixed by self-hosting; guarded by a test asserting no `file://` or `C:/` URLs in the built CSS. |
| Browser drive | Clicking a DAG node focused it, firing `onFocus`→select, then `onClick` toggled it straight back off — the drawer never opened. |
| Second API call | Migration guard missed "already exists" because Drizzle puts it on `error.cause`, not `error.message`. Every request after a restart 500'd. |
| Computed lane counts | Majority-vote column rule collapsed 325 to one lane (`Handoffs=0`). |
| Screenshot review | Document panel demanded all 44 documents at once — 6,100px page. Scoped to ready blocks. |
| Screenshot review | Parallel nodes crushed to one character per line when the drawer opened. |

**Planning.** Plan mode was used before the large build (§2 item 5), with three
approach questions answered up front — storage, classifier, DAG granularity.

**Data-first.** Before writing the delegation classifier, all 25 entities and
244 steps were dumped and eyeballed, and the rules re-run until nothing fell
through. Two edge cases were found that way: `Customs post "Avia yuklar" at the
airport's warehouse` must match *customs* before *warehouse*, and `Customs
warehouse` is a bonded cargo facility (Transport), not a government office.

---

## 5. Verification

```bash
cd apps/web
npm test      # build + unit suite + rendered-HTML tests
npm run lint
npm run dev   # :3000 (falls back to 3001/3002)
```

The suite covers: dashboard render · sidebar links resolve (no `href="#"`) ·
procedures page lists five with real counts · dataset integrity (block/step
counts, every `dependsOn` resolves, **acyclicity**, ≥2 roots and ≥1 join per
procedure) · every entity classifies with no fall-through · **every step
delegates to exactly one lane**, no online step is Physical, every payment is
User · self-hosted fonts serve over http.

Tests import the built worker through a loader stub
(`tests/loader.mjs`) that maps `cloudflare:workers` to an empty `env`, so
static routes are testable without a D1 binding. DB-backed routes are exercised
against the running dev server instead.

---

## 6. Decisions worth knowing

**Duty rates are not real.** The procedure documents contain **no HS codes and
no tariff data** (verified — one incidental "railway tariff" mention). The HS
*headings* are genuine WCO ones; the duty *percentages* are indicative ranges,
labelled "not verified against Uzbekistan's current published tariff schedule."
This mirrors the reference spec's own pattern — *"HS-code advisor suggests
candidates with duty/fee estimates; user confirms."* Swap `HS_REFERENCE` in
`modules/compliance/compliance.ts` for a real table when one exists.

**Two colour systems, deliberately.** `[data-lane]` is *who executes*
(User/Agent/Physical, drives columns). `[data-counterparty]` is *who you deal
with* (trader/agent/bank/government/transport, drives the "Deals with" chips).
A Single Window filing is Agent-executed with a Government counterparty — that
gap is the product, so both are kept.

**Dark mode is opt-in.** `:root[data-theme="dark"]`, deliberately **not**
`prefers-color-scheme`. An earlier version followed the OS and turned the
white theme black on a dark-mode machine.

**Agent steps complete themselves.** Document Intelligence and Compliance & Risk never ask the trader to confirm or "mark supplied" — by explicit instruction. The auto-verification runner lives in `cases/[id]/case-board.tsx` and serialises its writes, because `documentState` is read-modify-written on the server.

**Blocks are the DAG nodes**, steps live in the drawer. Dependency data in the
source is block-level, so step-level edges would have to be invented.

---

## 7. Open items

- `apps/.env` holds live Groq and HuggingFace keys. `.gitignore` covers
  `.env*` under `apps/web/` but **not** `apps/.env`. Add it before `git init`.
- Documents and Compliance & Risk sidebar entries are marked "Soon" — outside
  the five procedures.
- No file upload: R2 is unprovisioned, so Document Intelligence checks off
  declared outputs rather than reading real documents.
- `tsc --noEmit` reports pre-existing errors for `cloudflare:workers`,
  `Fetcher`, `D1Database` — `@cloudflare/workers-types` was never wired into
  `tsconfig`. Vite strips types without checking, so the build is unaffected.

### One case at a time, FAQ, export/import slot, upfront inputs (added 2026-09-13)
Spec: `Docs/superpowers/specs/2026-09-13-single-case-faq-upfront-design.md`.

- **One user, one case.** `modules/cases/active-case.ts` (`activeCase`, `latestCaseFor`,
  `resetAllCases`). The dashboard loads the open case and the chat is its
  current step; the composer is disabled until it is complete, and
  `POST /api/intake {confirm:true}` returns 409 while one is open.
  `POST /api/admin/reset {"confirm":"delete all cases"}` deletes every case
  table row and the R2 `cases/` prefix (users, entities, procedures kept).
- **Intake order:** What → Export/Import → How → How much → From/To. Only
  published directions are offered (dried fruit and fresh produce are export
  only, so it's stated); a route that contradicts the chosen direction asks again.
- **FAQ:** `modules/faq/faq.ts` + `/faq?q=`. A declined (not-a-shipment) chat message
  navigates there with the closest answers open.
- **Upfront inputs** (`modules/steps/upfront.ts`): an input qualifies when no
  earlier step produces it and the trader already holds or issues it. Given at
  step 0, it satisfies every later step (values are case-wide, documents are
  found by label/type, confirmations at step 0 count), so agent steps run
  without pausing. The `LATER` table gives the reason for the rest (offer
  amounts, agreements concluded during the procedure, portal applications,
  provider invoices, outputs). Shown as "Before you start" in the assistant.

### Project structure (restructured 2026-09-14)

```
apps/web/
  app/                 routes only - page.tsx, route.ts, layout.tsx, styles/
  components/          UI: chat/ (workspace, step-assistant), workflow/ (dag, case-board,
                       case-ledger, shipment-plan), documents/, compliance/, entities/,
                       layout/ (nav), icons.tsx
  modules/             logic, one folder per feature; no barrel files (keeps D1 code out
                       of client bundles)
    procedures/        data/procedures.generated.ts, delegation, actors, requirements, dag
    intake/            conversation, draft, taxonomy, lookup, validate, relevance, plan,
                       classify, shipment-plan, data/countries.ts
    workflow/          domain, orchestrator, specialists, repository (+ d1-repository,
                       d1-batching), service, dag-projection
    cases/             store, active-case, orchestration, block-progress
    steps/             ledger, next, upfront, kpis, assistant, service, context
    documents/         specs, checklist (block completeness), agent-tasks, docai/
    compliance/        compliance, risk
    catalog/           users, entities, procedure versions (catalog, bootstrap, seed)
    faq/  demo/        faq; demo.ts + data/scenario-868.json
    shared/            http
  db/  drizzle/  worker/
  scripts/             data/ (docx -> procedures), eval/ (eval-docai), debug/
  tests/               unit/<module>/ (npm run test:unit), e2e/ (npm run test:e2e, needs a build)

apps/docai/
  docai/               app.py (FastAPI), pipeline.py
  bench/               ocr, resolution, qa_window, readability  (python -m bench.<name>)
  tests/               python -m tests.test_pipeline
  scripts/             python -m scripts.download_models
  demo/  eval/         demo pack renderer; specimens, ground truth, reports
  run.ps1 / run.sh     uvicorn docai.app:app on :8765
```

Imports stay relative. `app/` holds no logic: a route imports from `modules/` and
renders `components/`.
