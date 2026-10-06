# AGENT.md

Working notes for the UzTrade agent workspace: what was asked, what was built,
how it was verified, and the decisions that are load-bearing. Written for
whoever picks this up next — human or agent.

---

## 1. What this application is

A case workspace for Uzbek trade procedures. A trader describes a shipment in
chat; the system matches it to a published procedure, opens a case, and renders
that procedure as a dependency graph showing **who has to do each step** — the
trader, an automated agent, or physical handling of the goods.

**Scope is every procedure in `Docs/Procedures`: 243 of them** (2026-09-19 —
see “All 243 procedures” at the end). Anything outside them is refused by name.
Ten were hand-checked first (306, 325, 477, 540, 868, 161, 57, 707, 782, 924)
and keep their curated graphs; the rest are parsed straight from the `.docx`.

| | |
|---|---|
| Procedures | **243** — 1,334 blocks, 5,539 steps, 44 entities named on steps |
| Kind | customs 128 · logistics 69 · service 46 |
| Direction | import 122 · export 119 · transit 2 |
| Mode | train 120 · road 58 · air 19 · any 46 |
| Regime | standard 151 · service 46 · clearance 40 · transit 2 · temporary 2 · re-export 2 |
| Goods | 40 categories (tea, fresh produce, dried fruits, juices, fertilizers, medicines, ozone-depleting products, …) |
| Lanes | user 2,524 · agent 1,825 · physical 1,190 |

The ten hand-checked procedures, which the demo pack and most tests use:

| ID | Procedure | Blocks | Steps | Published |
|---|---|---|---|---|
| 306 | Export of dried fruits by train | 10 | 48 | 81–241 h |
| 325 | Export of fresh fruits and vegetables by train | 10 | 48 | 81–241 h |
| 477 | Import of tea by train | 15 | 53 | 34–183 h |
| 540 | Export of tea by air | 9 | 47 | 30–108 h |
| 868 | Export of tea by train | 10 | 48 | 81–244 h |
| 161 | Clearance of fruit and vegetable juices by road (an export) | 2 | 13 | 2–12 h |
| 57 | Import of animal or vegetable fertilizers by road | 12 | 58 | 45–517 h |
| 707 | Import of animal or vegetable fertilizers by train | 17 | 60 | 49–531 h |
| 782 | Arrange cargo transportation by train via Single Window (rail logistics, any cargo) | 5 | 20 | 33–87 h |
| 924 | Arrange cargo delivery by train physically (rail logistics, any cargo) | 6 | 18 | 7–27 h |

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


---

## 3. What was built

### Data foundation
- `apps/web/scripts/data/build-procedures.mjs` → the catalogue in
  `modules/procedures/data/procedures.generated.ts` plus one workflow file per
  procedure under `public/data/procedures/`. Regenerate with `npm run data:build`.
- **The `.docx` files were originally not re-parsed**: for the first ten, blocks,
  `dependsOn` edges, `estDuration` ranges, `dependencyReason` prose and per-step
  entity/channel/output had already been extracted into
  `scripts/data/dag-data.json`, and re-parsing would have been slower and strictly
  worse. That still holds for those ten — their curated graphs win — but the
  other 233 are parsed from the `.docx` by `scripts/data/extract-all.mjs`. See
  “All 243 procedures” at the end.

### The delegation model — the heart of it
`modules/procedures/delegation.ts`. `performedBy` is blank on almost every step
(226 of the original 244; the same across the 5,539 in the full corpus), so
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

Result across the original ten: **User 151 · Agent 47 · Physical 46** —
agent-executed is **19%** of steps, not the 32% a naive "online ⇒ agent" rule
produced. Across all 243 the same rules give **User 2,524 · Agent 1,825 ·
Physical 1,190** (33% agent).

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
The returned id is **validated against the published catalogue** before use;
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
- **Entity APIs** (`apps/portals`, :8790, `npm start`; see its README): separate
  sandbox APIs for Single Window, Uzbekistan Railways, the Customs cabinet,
  Assalom Agro and Uzbekexpertiza (no bank). Each publishes its services' fields,
  refuses a form with `422 {missing, invalid}`, keeps an accepted application
  under review, then approves it (with what it issues) or requests changes; the
  applicant amends with `PATCH`. The agent side is `modules/portals/`: every
  online agent step maps to a service (`targets.ts`) — 47 across the original
  five, all 1,825 across the 243 —
  fields are filled from forms, profile, confirmed documents, intake and earlier
  approvals (`sources.ts`), and `agent.ts` turns the answer into workflow state —
  refused/changed fields pause the step as needs, the trader's answer refiles or
  amends, under review keeps the step `running` (read back on every run; the
  assistant polls `action: "sync"`), approval completes it. Every answer is a
  `portal_application` artifact; the assistant shows them under "Entity APIs".
  Unreachable service → the step is simulated as before. Tests:
  `apps/portals` `npm test` (8) and `tests/unit/portals/agent.test.ts` (4, runs
  the portal app in-process).
- **Language-model help** (`modules/ai/llm.ts` and six features). One JSON call
  with a schema; one rule: *public* prompts (typed chat, published procedures,
  intake goods) may use Groq; *document* prompts (anything read from uploads)
  only a loopback model (`LLM_LOCAL_URL`, e.g. Ollama `http://127.0.0.1:11434/v1`,
  `LLM_LOCAL_MODEL`) unless `LLM_DOCUMENT_DATA=external`. No model → rules only.
  1. **HS codes** (`compliance/hs-suggest.ts`, `hs-nomenclature.ts`): candidates
     only from a WCO HS 2022 6-digit extract under intake's heading; rules rank
     by colour/packing size, a model may re-rank; 10-digit codes end `0000`
     and say the national digits are unverified.
  2. **Intake** (`intake/llm-extract.ts`): only when rules don't understand or
     the text is Cyrillic; the model's slots are restated in English and the
     rules decide; unknown goods/places/units are dropped.
  3. **Company names** (`documents/docai/names.ts`): seller/buyer checks with
     transliteration and legal forms removed; only "unknown" pairs go to a local model.
  4. **Entity refusals** (`portals/fixes.ts`): suggested values (the number or
     option the entity named, HS candidates, the value reshaped, other case
     values) as "Use …" buttons, plus a one-sentence explanation.
  5. **Uncertain document fields** (`documents/docai/reread.ts`): local model
     only; a value must be quoted from the OCR text; agreement → accepted,
     new value → review.
  6. **FAQ answers** (`faq/answer.ts`, `/api/faq/answer`, FAQ page): BM25 over
     procedures, stages, steps, countries, document specs; the answer must
     cite passages, and is withheld if it states a number or website they don't.
  Measured against Groq (gpt-oss-20b): the Russian intake message resolved to
  868; "2 fura pomidor Andijondan Almatiga" first failed because Groq returned
  `unit: "fura"` (now: unknown units drop the count, the rules ask for train);
  the first FAQ answer came back without citations and was withheld (the prompt
  now shows the format and retries once). No local model is installed, so 3, 5
  and document-aware HS ranking currently run on rules.
- **Time: measured, planned, and asked for early.** Measured first: the critical
  path per procedure is 184–298 h and **agent steps contribute 0 h of it**
  (868/306: 84 h user + 112 h physical; 325/540: all physical; 477: 74 user +
  194 physical + 30 agent), so faster agent steps change no delivery date. What
  does:
  1. **Measurement** (`steps/timing.ts`): every span between a case's own audit
     events is attributed to you / an entity / the goods / the agent, with the
     rework count (pauses, refusals, change requests). Runs without timestamps
     report `measured: false`. The repository now exposes the stored
     `created_at` (D1 writes UTC without a zone - `iso()` fixes the reading).
  2. **Scheduling** (`steps/schedule.ts`): critical path over blocks with
     remaining hours scaled by open steps; each open step gets its slack, and
     the longest chain nobody has started is named ("start this today").
  3. **Entity pre-validation** (`portals/readiness.ts` + the sandbox's new
     `POST /{entity}/v1/services/{id}/validate`, which files nothing): every
     online step ahead is checked against its entity's own form rules, and what
     is missing is asked at the start - on case UZ-2609-0007, 8 steps checked,
     18 items, including the customs 10-digit HS code otherwise discovered at
     step 41.
  4. **Expiry** (`steps/expiry.ts`): validity dates an entity or document
     stated, checked against the remaining clock (expired / runs out before the
     shipment finishes / soon).
  5. **Document pack** (`documents/pack.ts`, `documents/ingest.ts`,
     `/api/cases/[id]/documents/pack`): several files at once, typed by file
     name, then printed title, then a local model; each is matched to the
     earliest open step that asks for that type. `apps/docai` caches OCR per
     file hash so the detect pass and the field pass cost one OCR.
  6. **Freeform notes** (`steps/note.ts`): "wagon 5 loaded, seals 88421" is read
     into the open steps' needs; a value that isn't in the note is refused, and
     nothing is recorded until you press Apply.

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

- **Several cases, dashboard follows the last one checked** (2026-09-14, replaces
  the one-case-at-a-time rule). The chat has a "+" for a new case & shipment;
  below it is the current step of the case checked last - created in the chat
  or opened at `/cases/[id]` (`components/cases/remember-case.tsx` sets the
  `uztrade_last_case` cookie, `modules/cases/last-case.ts`). `app/page.tsx`
  reads it and `currentCase()` (`modules/cases/current-case.ts`) falls back to
  the latest open case. `POST /api/admin/reset {"confirm":"delete all cases"}`
  deletes every case table row and the R2 `cases/` prefix.
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
    cases/             store, current-case, last-case, orchestration, block-progress
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

### Shipment workflow (added 2026-09-14)
A case no longer renders the bare published procedure. `modules/workflow/tailor.ts`
compiles the shipment's own workflow from the procedure and the case facts — a pure
function used by case creation (node titles, case title), the orchestrator, the step
engine (`loadCase`), the case board, DAG and case list. **Every published step stays**
with its number, entity, channel and input labels; each change carries a reason and a
source and is listed in the "Workflow for this shipment" panel:
- **Goods:** "Export of tomatoes by train"; certificate blocks name the goods; HS noted on the declaration.
- **Load:** wagon steps name the units; "Quantity of transport units" / "Amount of consignment" pre-filled; goods-handling blocks re-timed.
- **Route:** the Iran approval letter is *not needed* unless the rail corridor crosses Iran; transit and crossings on the dispatch step; the exporter's country named on imports.
- **Origin proof:** only the certificate-of-origin form the partner accepts gates the declaration.
- **Destination:** the partner's requirements are marked on the steps that meet them, or added as tracked needs on the step they gate (ISPM 15 → loading, GACC → declaration, food test report → declaration).
Lanes are always decided on the published title (`publishedTitle`), so tailoring never moves a step between you / agent / goods.

### UX pass (added 2026-09-14)
From a screenshot audit of every page at desktop and phone width:
- **Case page:** sticky section tabs (`components/cases/case-section-nav.tsx`) — Current step · Shipment plan · Workflow · Documents · Risk · Ledger — with scroll-spy (side-by-side sections keep the chosen tab; the last tab wins at the end of the page; a click locks the highlight while it scrolls). Anchors are `#case-*` wrappers in the case page and case board.
- **Dashboard:** recent-case chips under the chat switch the case shown below without leaving the page; `/` focuses the chat; "Before you start" starts collapsed there with a progress meter; the step assistant shows a loading skeleton.
- **Cases & Shipments:** search (reference, goods, route, procedure) and status filters with counts, instant and client-side (`components/cases/case-list.tsx`), with a clear-filters empty state.
- **FAQ:** search that opens every matching answer (`components/faq/faq-list.tsx`).
- **DAG:** Esc closes the block detail.

### Chat agent — reason first, then answer in place (added 2026-09-17)

**Asked:** the chat sent every non-shipment message to the FAQ, so "what
shipments are currently active?" showed the five-procedure FAQ. The agent has
to work out what is being asked first.

- `modules/assistant/router.ts`: a model reasons about the message and names
  one intent: **shipment** (open or continue intake), **cases** (the trader's
  own cases), **knowledge** (the procedures and how UzTrade works) or
  **other**. It sees the waiting intake question and the case list, so a
  question asked mid-intake stays a question and "my tea shipment" resolves to
  real case IDs (invented IDs are dropped). Rules decide only the unambiguous
  messages (a known case reference, a plain answer to the waiting question)
  and stand in when no model is available.
- `modules/assistant/cases.ts`: one digest per case (stages done or running,
  open steps and who each waits on). The model answers only from the digests;
  an answer with a number the digests don't contain falls back to the plain
  summary. With more than three cases the digests are brief, because Groq's
  free tier allows 8,000 tokens per minute and a full 12-case prompt got 429s.
- `modules/assistant/chat.ts` + `POST /api/chat`: streams NDJSON events
  (`stage`, `route`, `result`, `error`, `done`). If intake declines a message
  routed as a shipment, the message is answered as a knowledge question
  instead. Creating a case stays on `POST /api/intake` with `confirm`.
- `components/chat/agent-reply.tsx`: the stages as they stream in, the
  model's reasoning, then the answer in the chat: case cards (first four, then
  "Show all"; "Show below" switches the dashboard case), a cited procedure
  answer with a link to the FAQ, or suggestions. An intake in progress is kept.
- Verified in Chromium against the dev server with Groq: "What shipments are
  currently active?" → cases; "What documents do I need to export tea by
  train?" → knowledge; "I want to export tea" → intake asks for the mode; a
  certificate question asked mid-intake → cited answer, intake card kept.

**Follow-up (2026-09-17): the chat is a thread.** Intake no longer shows the
"Shipment so far" grid. Each question and each answer is a message
([agent-reply.tsx](apps/web/components/chat/agent-reply.tsx)): the details
collected so far appear as small pills, and a confirm box sits inside the
reply. Suggested next messages (`followUps` on the `result` event) appear under
the latest reply. After a side question they include the answers intake is
still waiting for. A question asked mid-intake is searched with the
shipment's context ("export tea by train"). Icons now default to `1em`, so a
glyph no CSS rule sizes can't grow to full width (the "big ticks").
`unsupportedClaims` checks a list like "4,5,8" number by number.

### Ten procedures, demo packs for all, field evidence, risk explanations (added 2026-09-17)

**Asked:** add the five remaining procedures in `Docs/Procedures` (161, 57, 707,
782, 924); demo documents for every procedure; show which fields a document
read produced, where they were found and with what confidence; and a “!” on
every risk row explaining why this procedure needs it, where the data comes
from and how it is cross-verified.

**Procedures.** `scripts/data/extract-procedures.mjs` parses the new `.docx`
files (summary table, section 3 entities and lanes, section 4 steps with
optional/alternative marks) into `dag-data.json`; `extract-inputs.mjs` and
`build-procedures.mjs` now cover all ten. The documents publish **no per-block
durations or dependencies**, so for the new five both are *derived*: a block
depends on the latest earlier block producing a document it needs, otherwise on
the block before it; the published end-to-end range is spread by step count.
Each block's `dependencyReason` says which rule applied. Parsed counts are
checked against each document's own summary table.
- `Procedure.kind`: `customs` or `logistics`. 782 (dispatch, treated as export)
  and 924 (delivery, treated as import) carry `goods: "any cargo"` — no HS
  classification, no declaration, no duty flags.
- 161's title says “Clearance” but its steps are an export declaration and an
  exit crossing, so it is `export` (override table in `build-procedures.mjs`).
- Intake: new categories `fruit and vegetable juices` (HS 2009, checked before
  fruit so “apple juice” isn't apples) and `animal or vegetable fertilizers`
  (3101; mineral fertilizers are still declined by name), plus `any cargo`
  reached by “arrange rail transport / cargo delivery by train”, with a
  dispatch-or-delivery question. Road is a real mode now: trucks as a unit
  (≈20–22 t), a road route model (corridors without gauge breaks), road
  quantity limits, and “3 trucks” / “2 fura” are measured.
- New document types `cmr_note`, `veterinary_certificate`,
  `certificate_of_conformity`; new section-5 headings are recognised as
  headings (`For issuance of…`, `Documents related to…`, `Not obligatory documents`).
- Mock portals (`apps/portals`): Single Window gained payment details,
  veterinary permit and certificate, and certificate of conformity; the
  railway gained GU-12 and the forms filed against it (GU-2, GU-45, SMGS,
  GU-2a, FDU-92). Every agent-lane online step of all ten procedures has a
  service (94 mapped).

**Demo packs.** `scripts/demo/build-scenarios.ts` generates
`modules/demo/data/scenario-<id>.json` for the nine procedures other than 868
(868 stays hand-written) from what a walk-through of each procedure asks for,
with one invented shipment each; receipts pay the offer or invoice still open,
weights agree with intake. `apps/docai/demo/generate_demo.py` renders them to
`public/demo/<id>/` (file names are prefixed with the procedure id so they're
unique). The procedure page links its pack. The upload fallback (document AI not
running) looks the file up in the case's own pack.

**Field evidence.** Each extracted field now carries `evidence` (question
asked, printed label read next to, page, other readings that agreed) and each
document its `reader` (document AI / demo pack / file text) and models.
`modules/documents/docai/evidence.ts` turns that into words. The review table
shows value, a confidence meter with the 80%/50% gates, and where it was found;
a confirmed document keeps a read-only “Fields read” view.

**Risk explanations.** `modules/compliance/explain.ts` builds, per row, *why this
procedure needs it*, *where the agent gets it* (intake, or the document with the
step that produces or asks for it, and the fields read — ticked when already in
the case) and *how it is cross-verified* (from the document specs' checks). The
panel shows it as a hover card on “!” and a dialog on click.

**Verified** in Chromium on the dev server: the procedures page lists ten; the
161 page's risk rows show the hover card and dialog; a 161 case was created from
the chat (`UZ-2609-0034`), its commercial invoice loaded with “Demo” and reviewed
field by field (document AI offline → demo pack reader), and the case's risk
dialog ticks the invoice as already in the case. Unit tests: 181 pass; portals: 9 pass.

---

## Simpler UI and the payment gateway (2026-09-17)

**UI.** The dashboard keeps the chat and, below it, only the case's steps (no
KPIs, no "ask about this procedure", no activity feed). A case page is the
workflow followed by the two agents (Document checks, Risk analysis); the
tailored title, section tabs, plan/readiness/upfront panels, shipment plan and
tailoring panel are gone. A new **Ledger** page (`/ledger`, sidebar) shows one
case's append-only ledger and every entity API application, with a case picker.

**Payments go through the system.** This supersedes instruction 7's "`bank: pay`
is always the user" for online bank transfers:

- `apps/portals` has a sixth entity, the **payment gateway** (`/payments/v1`,
  service `transfer`, key `PORTAL_KEY_PAYMENTS` / `pg-dev-key`). It checks the
  account (20 digits) and MFO (5 digits), the amount against the document being
  paid (read from the registry when that is an approved application, e.g.
  railway cost calculation or Single Window payment details), the payment
  reference in the purpose, the single-payment limit, funds (sandbox: account
  ending `0000` is empty) and duplicates, then books the transfer and issues
  the receipt (`receipt_no`, `transaction_id`, `status: Paid`).
- Delegation: an `Online: pay` step whose entity is `Bank` / `Online banking
  system` (56 steps) is now the **agent's** (action "Agent pays"). Paying anyone
  else (cargo sales agent, E-tranzit card payment) and in-person payments stay
  with the trader.
- Money never moves without the trader: each gateway payment gates on a
  **Payment authorisation** confirmation for that step
  (`modules/steps/authorisation.ts`). The step takes the online variant itself
  and asks for no receipt upload — the gateway's receipt completes it.
- The agent fills the transfer from the company profile (`Bank details` →
  account, MFO), the offer agreement / invoice uploaded for the payment or the
  approved application that produced it (amount, number, payee), and the
  payment reference `<case>-P<step>`. Answers to per-payment fields are stored
  per step (`Amount to pay, UZS · step 4`) so one payment's amount never leaks
  into the next. Case readiness asks only for the payer fields up front.
- The railway cost calculation now also issues `amount_uzs` (sandbox rate
  12 650 UZS/USD) so the prepayment can be checked against it.
- Cases opened before this change keep their stored lanes (trader pays).

Tests: web unit 185 pass (new: gateway payment end to end; bank vs non-bank
payment lanes); portals 12 pass (new: transfer approved / duplicate, amount,
reference and funds sent back, amount checked against Single Window details).

**Demo documents look like the real forms.** `apps/docai/demo/forms.py` (with the
drawing kit `kit.py`) now draws every demo page with the layout of the printed
form it stands in for, instead of a list of the parsed fields: the SMGS 29-box
grid with the wagon table, the CMR 24-box note, the IATA air waybill with the
charges block, the TD1 declaration boxes 1–54 with the duties table, the IPPC
phytosanitary and CT-1 certificates, the bilingual invoice with line items and
FOB/CIF totals, the two-page bilingual contract, the treasury receipt in two
copies with digit boxes and amount in words, the Uzbek offer agreement with its
service table, GU-12 with the loading schedule, the invoice for payment with VAT,
the power of attorney, packing list, lab protocol, veterinary and conformity
certificates and the quarantine permit — with seals, signatures, QR codes and
the secondary details a real form carries. The 123 "letter" documents are drawn
by kind: letterhead application, Single Window printout, issued certificate,
carrier/transit paper (TIR carnet, control book, ATP, permits), service
agreement, purchase act / land lease, notice or telegram, covering register, or
an explanatory note for a letter the route doesn't need. Passports, driver's
licences and bank cards stay plainly marked specimens with masked numbers.
`generate_demo.py` renders all ten packs (868 included); `generate_868.py` is a
wrapper. Every page keeps its DEMO banners.

---

## Transit & Capacity — the third agent (2026-09-18)

Document Intelligence handles paperwork and Compliance & Risk judges the rules;
the **Transit & Capacity agent** (`modules/transit/`) is the logistics one: it
answers where the cargo has to go, how it moves, what capacity and equipment
that takes, whether transport has actually been arranged, where the shipment
stands and what is blocking the movement. It books nothing itself — the entity
APIs file the bookings and the workflow owns the step states.

- **Capacity** (`transit.ts`): units and equipment sized from the load
  (`unitsFor`), against what the case itself declares ("Quantity of transport
  units"). A load over the carrier's per-unit limit (rail 68 t, matching the
  railway API's own rule) or a declared count that doesn't fit the tonnage is an
  exception, not a silent number.
- **Route and legs**: origin → loading → dispatch → border → customs → arrival,
  each leg carrying the procedure's own step numbers and marked done / active /
  waiting from the workflow.
- **Movement state**: nine milestones (planned → capacity requested → confirmed
  → cargo ready → loaded → departed → at the border → customs released →
  arrived), derived from which movement steps are complete (`milestoneOfStep`).
- **Transport references**: wagon, dispatch, CMR, air waybill, seals and flight
  numbers read from confirmed documents and from what the carrier's API issued.
- **Exceptions**: capacity mismatch, over-limit load, a transport application
  the carrier refused or is reviewing, no unit numbers after loading, movement
  waiting on the trader, break of gauge, and cold-chain/transit-time notes.
  Cold-chain findings carry `handOff: "risk"` — compliance stays the Risk
  agent's call.
- **Reporting back**: after every orchestrator pass `recordTransitState` writes
  an artifact and one audit event (`transit_state_changed`, actor
  `transit_capacity`) when the milestone has changed, so the Ledger reads
  "Transit & Capacity — movement state changed". Nothing is written when the
  cargo hasn't moved.
- **Steps it owns**: `specialistFor` routes wagon/freight/loading/dispatch/cost
  steps to `transit_capacity` — unless the step's point is a document, which
  stays with Document Intelligence.
- **Surfaces**: `/api/cases/[id]/transit`, the third panel on a case beside
  Document checks and Risk analysis (`components/transit/transit-panel.tsx`),
  and the renamed Transit & Capacity Agent in the Agent Center.

Tests: `tests/unit/transit/transit.test.ts` — capacity and route from the load,
milestones following the completed steps, the over-limit and capacity-mismatch
exceptions, and the agent recording its state once (189 unit tests pass).

---

## All 243 procedures (2026-09-19)

The corpus stopped being a curated ten and became everything in
`Docs/Procedures`. **Workflows only** — no demo documents or scenario data were
generated for the new 233; the demo pack is still 868 alone.

### Extraction
`apps/web/scripts/data/extract-all.mjs` reads every `.docx` directly
(`unzip -p … word/document.xml`, parsed in parallel), skipping `(N).docx`
duplicates, and writes one `scripts/data/procedures/<id>.json` per procedure
plus `catalogue.json`, `entities.json` and `extract-report.json`. Each parse is
checked against the procedure's *own* summary table — block count, step count,
timeframe — and a mismatch fails the file rather than publishing a half-read
workflow: **243 parsed, 0 failed, 0 mismatched**. Step inputs come from the same
pass, so **5,538 of 5,539 steps carry at least one input**.

`scripts/data/build-procedures.mjs` then emits the catalogue and the per-procedure
files. Two rules matter:
- **Curated graphs win.** For the original ten, `dag-data.json` supplies blocks,
  `dependsOn`, durations and dependency prose; only the step inputs are taken
  from the new extraction. Deriving their dependencies again produced a
  different (and worse) graph — 868 block 2 started waiting on block 1 — so the
  hand-checked edges are preserved.
- **The title is the taxonomy.** `parseTitle()` derives `direction`, `goods`,
  `mode`, `kind` and `regime` from the procedure's own title, which is what
  intake matches against and what the filters on `/procedures` use. "Clearance"
  is a regime of its own: procedure 251 legitimately lacks the quarantine permit
  a standard import rule names, because clearance starts after it.

### Why there is a catalogue and a registry
The workflows come to **3.4 MB**, which cannot be bundled into a Worker. So:
- `modules/procedures/data/procedures.generated.ts` holds only the **catalogue**
  (id, title, taxonomy, counts, timeframe) — every list, search and intake match
  needs all 243 rows, and that is 151 KB.
- `public/data/procedures/<id>.json` holds each **workflow**, loaded on demand by
  `modules/procedures/registry.ts` and kept in memory afterwards (`getProcedure`,
  `requireProcedure`, `getProcedures`, with an in-flight map so a burst of
  parallel requests loads a file once).
- Three sources, tried in order: the ASSETS binding, **the application's own
  origin** (the Worker has no filesystem — `public/` is reachable only over
  HTTP, and `next/headers` says which host to ask), then the filesystem for
  tests and scripts.
- `modules/procedures/sync.ts` is a Node-only Proxy so tests can keep writing
  `PROCEDURES["868"]` synchronously.
- `components/procedures/procedure-filter.tsx` gives `/procedures` client-side
  search and a kind filter, because 243 cards are not a list you scroll.

### Entity APIs — 12 of them
Every one of the **1,825 agent-lane steps is online, and all 1,825 map to an
entity API service** (`modules/portals/targets.ts`), so no agent step is left
simulated. Six sandboxes were added for the new corpus:

| Entity | Services |
|---|---|
| `e-tranzit` (`transit-customs.ts`) | transit declaration, transit fee |
| `sanitary` | conclusion application, conclusion, its invoice |
| `medicines` | registration check, services contract, registration application, certificate |
| `ecology`, `cargo-agent`, `edocs` (`misc.ts`) | ecological permits, forwarding, e-document delivery |

Railway gained arrival notice, loading-place notice, empty-wagon return and
empty-wagon bill; Single Window gained the ecological certificate (and its
issue) and the installation letter. All twelve answer `/health`
(`single-window, railway, customs, assalom-agro, expertiza, payments,
e-tranzit, sanitary, medicines, ecology, cargo-agent, edocs`) and behave the
same way as before: publish their fields, refuse with `422 {missing, invalid}`,
hold under review, then approve or request changes.

### Who you are dealing with, at corpus scale
`modules/procedures/actors.ts` classified 33 of the 44 entity names the corpus
uses; the other 11 fell through to "government", including **State border
crossing point — the single most common entity of all, on 434 steps**. Rules
were added for the border posts, the E-tranzit customs system, the tax portal's
document exchange (`my.soliq.uz`), UzTest, certification bodies, the nature
protection committee, the export promotion agency, the `uzpharminfo` register
and the place equipment is installed. **Insurance company** is not a state body
and not a carrier, so a sixth counterparty, `commercial`, was added for private
providers (with its own chip colour). `scripts/debug/unclassified-entities.ts`
prints what still falls through: currently **0 of 44**.

### Two things that were broken and are not corpus problems
- **`vinext dev` 500s on every page.** workerd's `nodejs_compat` console
  polyfill defines `console.createTask` as a stub that *throws*
  `ERR_METHOD_NOT_IMPLEMENTED`, and React 19.2's development build calls it for
  every element the moment it sees the property. `vite.config.ts` now compiles
  the property away (`define: { "console.createTask": "undefined" }`), which is
  exactly React's own fallback. Production React never creates tasks.
- **Cases needed a `DATABASE_URL` nobody had.** Since the move to Neon
  Postgres, `db/index.ts` had no local path, so `/cases`, the ledger and the
  entity-record pages showed "DATABASE_URL is required". Fixed below.

### Verified
- `npm run test:unit` — **189 pass, 0 fail**; `npx tsc --noEmit` clean; the tests
  that used to encode facts about ten procedures now assert the property over
  whichever of the 243 it applies to (certificate rules, declaration steps, FAQ
  passages), and `complianceTasks()` no longer tries to classify goods for a
  procedure that declares none — service procedures join logistics on the "No
  classification" path.
- `apps/portals` `npm test` — 12 pass.
- `npm run build` clean, then `npm run test:e2e` — **11 pass, 0 fail**. That
  suite had been stale since the ten-procedure expansion; it now asserts over
  the whole corpus: the procedures page lists all 243, every step of all 5,539
  falls in exactly one lane, no online step is Physical, every payment is the
  trader's, every entity classifies, and every procedure carries a valid
  direction/mode/kind/goods. Two assertions were narrowed to the truth rather
  than kept as fiction: the parallelism check (≥2 roots, ≥1 join) now applies
  only to the five graphs that fan out — 57, 161, 707, 782 and 924 are
  genuinely sequential chains.
- `npm run lint` — 0 errors (drizzle-kit's generated output is ignored by
  `eslint.config.mjs` and `tsconfig.json`; the `.sql`-derived `schema.ts` it
  emits does not parse).
- Running app: `/procedures` lists all 243 with working search, 30 sampled
  procedure pages render their real blocks, steps and critical path, and intake
  matches "export 20 tonnes of tomatoes … by train" to procedure 325.
- `scripts/debug/corpus-coverage.ts` prints the lane split and entity-API
  coverage quoted above.

---

## A database you can run locally (2026-09-20)

Production is Neon; locally there was nothing, so every page that reads a case
failed. Now `npm run db:setup` gives you a working database in one command, and
the same code path is what Vercel runs.

- **The cluster** (`scripts/db/local-postgres.mjs`): a Postgres cluster of our
  own under `.pgdata/` (gitignored) on port **5433**, created with `initdb`,
  trust auth on loopback, superuser `uztrade`. It uses the newest PostgreSQL
  binaries on the machine (`PG_BIN` overrides) but shares nothing with the
  installed service — no password to keep, and starting it cannot disturb
  whatever else is on 5432. `db:start`, `db:stop`, `db:psql`, and `reset` for a
  clean slate.
- **The setup** (`scripts/db/setup.mjs`, `npm run db:setup`): start, create the
  database, write `DATABASE_URL` into `apps/.env` (the Worker's vars in dev and
  build) *and* `apps/web/.env.local` (drizzle-kit, `next build`), then apply the
  Drizzle migrations. Idempotent — every step checks first.
- **Two drivers, one schema** (`db/index.ts`): the URL decides. `*.neon.tech`
  keeps the Neon HTTP driver (stateless, cached for the isolate's life);
  anything else opens a TCP connection with postgres.js. Callers see the same
  drizzle instance and `getDb()` stayed synchronous, so no call site changed.
- **One connection per request.** A Worker refuses to let one request use a
  socket another request opened ("Cannot perform I/O on behalf of a different
  request"), which is exactly what a cached TCP connection is. `withDbScope`
  (an `AsyncLocalStorage` scope entered by `worker/index.ts` around every
  request) holds one connection per request; outside a request — tests,
  scripts, `next build` — a single lazy one is fine.
- **One alias worth knowing** (`vite.config.ts`): postgres.js publishes a
  Cloudflare-specific build under the `workerd` export condition that speaks
  `cloudflare:sockets`. `vinext start` serves the same bundle from **Node**, so
  those queries failed. workerd's `nodejs_compat` provides `node:net`, so the
  standard build runs in both — the alias pins it.

Verified end to end on the local database: opening a case from chat
(`POST /api/cases` → UZ-2609-0001 on procedure 325), its page, the ledger, the
assistant/transit/risk APIs, and one orchestrator pass — **1 case, 10 blocks, a
workflow run with 48 nodes, 6 audit events, 1 artifact** persisted. Both `npm
run dev` and `npm run build && npm run start` serve it. 189 unit + 11 e2e pass,
`tsc` clean, lint 0 errors.

### The generated schema that would not parse
`drizzle-postgres/` held two files nobody used and nothing could compile:
`schema.ts` and `relations.ts`, left over from a `drizzle-kit pull`. The cause
is a bug in drizzle-kit 0.31.10 (the current release — there is no fixed
version to upgrade to): a column whose default is the empty string is written
as `.default(')`, an unterminated string literal. Reproduced exactly against
the local database, three columns affected (`cases.goods`, `cases.query`,
`workflow_nodes.output_name`).

The fix is structural, not a suppression:
- `drizzle-postgres/` is the **migration history and nothing else**. The two
  introspection files are gone from it (copies kept out of the repo).
- `npm run db:pull` (`scripts/db/pull.mjs`) introspects into `.drizzle-pull/`,
  which is gitignored and disposable. It must not pull into the migrations
  directory: a pull emits a full migration plus its own journal, which would sit
  next to `0000_charming_queen_noir` and confuse `drizzle-kit migrate`.
- The script repairs `.default(')` → `.default('')` in what drizzle-kit emits,
  then checks every generated line for an unbalanced quote and fails loudly if
  one survives, so a new codegen bug is reported rather than silently shipped.
- The earlier workaround is reverted: `eslint.config.mjs` and `tsconfig.json`
  no longer skip `drizzle-postgres/` and `drizzle/` (they hold only SQL and
  JSON now) — only the throwaway `.drizzle-pull/` is ignored. Lint and `tsc`
  are clean without hiding anything.

`drizzle-kit migrate` still reports the one migration applied and re-running it
is a no-op.


---

## Any product, its own name, and a vision model that reads the papers (2026-09-20)

Three things were wrong at once after the corpus grew to 243 procedures: intake
could only reach six of the goods categories, a case for yoghurt talked about
"dairy products", and the document reader was a Python service running two
models on Hugging Face.

### Intake reaches the whole corpus
`modules/intake/taxonomy.ts` hardcoded six categories - tea, dried fruits, fresh
produce, juices, fertilizers, any cargo - and an `UNSUPPORTED` list that refused
words the corpus *does* publish (cotton, dairy, meat, coffee, honey, cement).
Now:

- **The categories come from the corpus**, not from the file: `CATEGORIES` is
  derived from the catalogue, so publishing a procedure makes its goods
  reachable. 38 categories, after the fix below.
- **The lexicon is the vocabulary, not the list**: which words a trader uses for
  each category and the HS heading that justifies the match - yoghurt, kefir and
  suzma are dairy products (0403); lagman is pasta (1902); kishmish is dried
  fruit. `scripts/debug/lexicon-check.ts` asserts every published category is
  reachable from ordinary words, and that each is also matched by its own name.
- **"Clearance of temporary import of medical equipment" is not a goods
  category.** `parseTitle` now splits that basis off into a `basis` field, so
  medical equipment is one category with a temporary-import variant rather than
  two categories that split the goods. 40 categories became 38.

### Which treatment: the whole trade, or clearance only
The corpus publishes up to four regimes for the same goods, direction and mode -
dairy products by road is a full import (109) *and* a customs clearance
(175/217). Intake asked neither; it took the first id it found. There is now a
`regime` slot, asked only when more than one is published, in the trader's
words: "The whole import - permits, contract, transport and clearance" against
"Customs clearance only - the goods are already at the border". `pickProcedure`
settles the corpus's genuine duplicates deterministically (most steps, then
lowest id) instead of taking whichever came first.

### Goods no category names
A trader who says "saffron" used to hit a dead end. `modules/intake/nearest.ts`
asks a model one narrow question - of these published categories, which would
this product trade under, and why - and then:

- the answer is **checked against the corpus**; an invented category is dropped
  with the whole proposal;
- the proposal is **never applied on its own**: it goes back as a question with
  the reasoning attached ("Saffron is a dried food crop, published with cereals
  (HS 0910). Shall I open the case for saffron under the published cereals
  procedure?") and only a yes sets the goods;
- the **product keeps its own name** on the case that follows.

Without a model there is no proposal and intake says plainly what is published.

### The product, not the category
`tailorProcedure` renamed the category to the product only when its six-entry
table recognised the word; for everything else the case talked about the
category. It now trusts the goods intake settled on - including a word the
lexicon has never heard of - and falls back to the published category only when
there is nothing else. The HS heading travels with the shipment
(`ShipmentFacts.hs`) instead of being re-derived from a word. Intake's own
questions name the goods too: "By air, raisins (dried fruits) is only published
as export", never "dried fruits" alone.

### Documents: one Groq vision call, and nothing trusted without a quote
`modules/documents/docai/groq-vision.ts` replaces EasyOCR + LayoutLM with a
single call to a vision model (`meta-llama/llama-4-scout-17b-16e-instruct` by
default, `GROQ_VISION_MODEL` to change it). The model returns a transcript of
the page and, per field, a value, the line it read the value from, and its own
confidence.

A vision model's confidence is self-reported, and a confident misreading looks
exactly like a confident reading, so **the quote is checked against the
transcript the same call produced** - and so is the value:

| | |
|---|---|
| quote and value found in the transcript, confidence ≥ 0.80 | accepted |
| found, confidence 0.50-0.79 | review, pre-filled |
| not found in the transcript | capped below the accept gate - never auto-accepted, flagged `groq-vision-unverified` |

The scores go to the same `compose.ts` gates as before, so nothing downstream
changes. `modules/documents/docai/reader.ts` picks the reader: Groq when a key
is set, the DocAI service (`apps/docai`) for PDFs - a vision model takes images,
and rasterizing is what that service is for - and for running with no Groq key
at all. `DOC_READER=docai` keeps documents off Groq entirely. **With a key set,
page images are sent to Groq**; that is the deliberate change, and it is the one
configuration switch that reverses it.

**Which model.** Groq accounts differ in what they expose, so the reader tries
`llama-4-scout`, then `llama-4-maverick`, then `qwen/qwen3.8-27b`, keeps the
first that answers, and `GROQ_VISION_MODEL` overrides the list. This machine's
key has **no Llama 4 access** - of its 13 models only `qwen/qwen3.8-27b` accepts
an image - so `apps/.env` pins that one and the fallback is what found it.

**What it reads, measured on the demo pack** (real bilingual documents, not
fixtures):

| Document | Result |
|---|---|
| Commercial invoice | **14 of 14 fields accepted**, 4.7 s |
| Railway bill (SMGS) | **13 accepted**, 4.5 s |
| Phytosanitary certificate | 7 accepted, 5 not on the page, 3.4 s |

Every accepted value carried a quote the transcript backed. For comparison, the
EasyOCR + LayoutLM pipeline scored 75 of 160 fields on the same kind of pages.

**The tier is the constraint, not the model.** This key is on Groq's free tier:
1000 output tokens per minute for that model, and a request asking for more than
that is refused outright rather than truncated. So `max_tokens` defaults to 1000
(`GROQ_VISION_MAX_TOKENS` raises it), the prompt asks for the lines that carry
values rather than every line on the page, and a cut-off or malformed answer
throws instead of being recorded as an empty document - which sends it to the
DocAI fallback. In practice that tier reads roughly **one document a minute**;
real throughput needs a paid tier.

### Verified
- `npm run test:unit` — **203 pass, 0 fail**, including new suites for the
  nearest-category proposal (`tests/unit/intake/nearest.test.ts`: the reasoning,
  the yes and no paths, an invented category dropped, and goods the lexicon
  knows never reaching the model) and the vision reader
  (`tests/unit/documents/groq-vision.test.ts`: an unsupported value refused
  auto-acceptance however confident, nulls and labels left for the trader, only
  images going to the model, PDFs falling through to the service).
- `tsc` clean, lint **0 errors 0 warnings**, `npm run build` and
  `npm run test:e2e` (11 pass) clean.
- Live, against the running app and the real Groq key: "import yoghurt by road"
  opens **"Import of yoghurt by road"** on procedure 109 with HS 0403 carried
  through and six steps naming yoghurt; "export carpets by train" reaches 1052;
  "import manure by train" asks which treatment; "export silk scarves" is
  proposed as textile and garment; saffron, walnuts and excavators are refused
  by name.
- Two bugs the live runs found and fixed: "export walnuts **to Turkey**" read as
  poultry (the bird's name was claiming the country's), and the model's HS
  heading for infant formula was 2403 - tobacco - so a heading is now shown only
  when `modules/compliance/hs-nomenclature.ts` has it.
  `scripts/debug/lexicon-collisions.ts` checks every goods word against every
  place the gazetteer knows.


### What growing the corpus had quietly broken elsewhere
Reaching 38 goods categories from 6 left several modules still deciding by one
category name. None of them failed loudly; they gave wrong answers quietly.

- **A cold chain is a cold chain.** `unitsFor` called a wagon refrigerated only
  for "fresh fruits and vegetables", so a case for yoghurt planned a dry covered
  wagon, the Transit agent asked for no reefer, and Risk called it shelf-stable.
  `modules/intake/goods-handling.ts` now holds both planning facts per category
  - the temperature chain, and whether weight or space runs out first - and
  compliance, risk, explanations, the shipment plan and the Transit agent all
  read it. Cheese by train is **2 × refrigerated wagon**; butter by road a
  **refrigerated truck**; carpets a covered wagon sized by volume, not by the
  30 t default. The table is explicitly planning defaults, never a regulatory
  claim, and an uncharacterised category stays ambient and standard.
- **The chat path could open a clearance-only case by accident.** `settleMatch`
  narrowed by goods, direction and mode and then took `fits[0]` - the lowest id.
  For dairy products by train that is 284, a *clearance* procedure, which
  presupposes the permits the full import (288) produces. It now narrows by
  regime as well: the trader's own words when they gave any ("temporarily" →
  1092), otherwise the whole procedure, with the choice in the rationale.
- **"Goods vs intake" checked three categories.** The document cross-check
  matched a document's goods line against a table with entries for tea, dried
  fruit and fresh produce; for everything else the check silently never ran.
  It now compares against the case's own goods, so "Scarves, 100% silk" matches
  a case for silk scarves with no table entry, and the curated bilingual
  patterns still cover Чай/Чой and the rest.
- **An empty certificate list read as "nothing required".** Rules exist for 8
  goods-and-direction pairs; the other categories produced no rows at all. The
  Risk agent now says so in a row of its own - "No rule published for these
  goods … documents the procedure's own steps produce are still checked" - and
  compliance lists the missing rule among its unresolved inputs, the way the
  duty-rate gap is already handled.
- **The FAQ answered "what do you cover?" with 243 titles.** It now answers with
  the counts by kind, the goods categories, and how to ask for a product.
- **The document-data rule in `modules/ai/llm.ts` no longer matched reality.**
  Its comment said document content only ever goes to a local model; page images
  now go to Groq by design. The comment states the exception and its switch, and
  still governs the text prompts derived from a document afterwards.
- **The case row and the Transit panel named the category.** Both carry the
  goods intake settled on now, so a case for butter says butter everywhere.

Tests: `tests/unit/intake/goods-handling.test.ts` (the cold chain across all
three modes, the unit bands, and every published category planning a load),
plus `scripts/debug/chat-path-check.ts` and `scripts/debug/case-shape-check.ts`
for the two paths. **206 unit + 11 e2e pass**, `tsc` clean, lint 0/0, build
clean.


---

## An eval system, and gold data to hold it to (2026-09-20)

`npm run eval`. Six suites, two kinds, one rule about what may be asserted.

### Deterministic suites are gates, model suites are measurements

| Suite | Must score | What it answers |
|---|---|---|
| `corpus` | 100% | Do all 243 procedures still parse, count and depend as their documents say? |
| `taxonomy` | 100% | Does a trader's word reach the right category — and stay away from the ones it must not? |
| `intake` | 100% | Do the gold conversations reach the right procedure, treatment and questions? |
| `planning` | 100% | Across every goods category: is a load sized, is a cold chain honoured, does an agent ever claim a rule it lacks? |
| `documents` | 80% | Do the demo pages read back as the values they were rendered from? |
| `groq` | 80% | Does every feature that calls a model still work against the live API? |

Rules, tables and the corpus should not drift, so those four must be perfect and
the run fails otherwise. A model is not an oracle, so its suites carry a
threshold and are skipped entirely without `GROQ_API_KEY`.

### The gold, and why it is checked before it is used
`evals/gold/intake.json` and `taxonomy.json` are hand-written and every row says why
it is the answer. Document gold is not written at all: the demo packs
(`modules/demo/data/scenario-<id>.json`) are the values the pages in
`public/demo/<id>/` were generated from — **201 documents across 10
procedures** with a true answer for every field.

Every expectation is verified against the published catalogue before the case
runs: a row naming a procedure, direction, mode, goods or regime the corpus does
not publish reports as `GOLD`, not as a product failure. That distinction is
what keeps an eval honest when the corpus moves underneath it.

What the gold deliberately avoids is asserting the numbers a table currently
produces — asserting a wagon holds 30 t only asserts the table still says 30.
`planning` checks properties instead: every perishable category travels
refrigerated in **every** mode, no ambient one does, every category sizes a
load, and every certificate a rule names is the declared output of a step.

### What the first runs found
The harness earned its place immediately.

- **In the eval itself**: a category (`vegetable oils`) that no gold word
  reached, and a comparison that scored the Cyrillic "ООО" on a page against the
  Latin "OOO" in the gold as a misreading. The comparator now folds the
  homoglyphs — measuring the model, not the eval's alphabet — and that took the
  receipt from 6/7 fields to 7/7.
- **In the product**: a dense page (the foreign trade contract) whose transcript
  cannot fit the free tier's 1,000-token answer, so Groq refused with
  `failed to generate json` and the trader got nothing. There is now a second
  pass for that page: fields and quotes with **no transcript**, every value
  marked `groq-vision-no-transcript` so none of them can be auto-accepted, and a
  readability note saying the page was too dense to transcribe in full. Reading
  a contract and asking the trader to confirm it beats handing back a blank.

### Measured
- Deterministic: **76/76**, all four suites at 100%.
- `groq`: **8/8** live — the vision model the account can actually use, a Russian
  message read into slots, a category proposed for silk scarves, excavators
  refused by name, HS subheadings ranked inside the app's own nomenclature, and
  the three gold conversations that need a model.
- `documents`: passport 3/3, power of attorney 5/5, receipt 7/7 fields. The
  failures in a run are rate limits, not misreadings — the suite paces itself
  (`EVAL_DOC_PACE_MS`) so it measures reading rather than the free tier.


---

## The dashboard becomes a chat (2026-09-21)

The dashboard used to answer in components: a reply was a card with stage
chips, a routing line, an intake panel, and under it a step assistant with lane
badges, entity chips, a needs table and a channel switch. Everything was on
screen and nothing said what to do.

It is a conversation now.

### The answer is written, not filled in
`modules/assistant/say.ts` turns every result the chat produces - an intake
question, an answer about your cases, an answer from the procedures - into
sentences, and `runChat` streams them a few words at a time (`{type:"text"}`
events alongside the stages that were already streaming). The client appends
them as they arrive, with a caret while it writes.

Nothing is invented on the way: `say.ts` only rearranges what the modules
already decided, and leaves a sentence out where a value is missing. It also
removes the `[1]` citation markers from a model's answer and lists the sources
after it, where they read as sources rather than noise.

### A step, in plain English
`modules/steps/briefing.ts` says a step as **what to do**, **why it matters**,
and what it still needs:

> Step 1 · Register foreign trade contract in UEISFTO
>
> Register foreign trade contract in UEISFTO, online at unified state services
> my.gov.uz.
> It produces the identification number of foreign trade contract, which Single
> portal of interactive state services issues and later steps are checked
> against.
> Before it can move it needs one document uploaded and one thing confirmed.

Two details that took a second pass: the published `where` usually names the
portal twice on either side of a dash ("my.gov.uz — unified state services
my.gov.uz"), which reads as a bug, so the repeated half is dropped; and small
numbers are written as words, because "there are 1 document" is not English.

An agent step says there is nothing to do and that it will report back; a
paused one says what it is waiting for.

### One button, when there is something to upload
The only control a step puts in the conversation is **Upload <the document>**,
and only while that document is actually missing - not for a value, not for
something already provided, and not for an input this shipment does not need.
Uploading says what was read back ("14 fields accepted, 2 to confirm") and then
what to do next.

### Recent chats
The sidebar lost the two "Soon" entries and gained a history: **New chat**, then
the conversations, newest first, each reopening where it left off.

Sessions live in the visitor's own browser (`modules/chat/sessions.ts`). There
is no sign-in, so a chat stored on the server would be everyone's chat - the
next demo visitor would open the sidebar and read the last one's conversation.
localStorage keeps each visitor's history to themselves with no account, no
cookie and no table, at the cost of not following them to another device.

One trap worth remembering: the history reads `?chat=` to mark the open
conversation, which makes it client-only. Without a `<Suspense>` boundary it
stopped every static page from prerendering, and `npm run build:vercel` failed
on `/404` rather than on the dashboard.

### What went
`components/chat/agent-reply.tsx`, `step-assistant.tsx` and `case-note.tsx` -
about 740 lines of cards - are gone. The status labels the ledger still needs
moved to `components/chat/portal-status.ts`. The case page keeps its workflow
diagram, agent panels and ledger for anyone who wants the detail; only the
dashboard became prose.

Tests: `tests/unit/chat/briefing.test.ts` - what a step says, when the upload
button appears, what an agent step says, how a ready shipment is put, and that
the streamed chunks reassemble into exactly the text. **212 unit + 11 e2e
pass**, both builds clean, lint 0/0.


### The answer about your cases was unreadable
Asked "which shipments are currently active?", the app replied with a wall of
case ids and step numbers — *"Both cases need your action on steps 2, 7 and 11;
case UZ-2609-0009 also requires step 1"*. Three things were wrong, and the first
was mine:

- **The prompt still described the old dashboard.** It told the model each case
  was "already shown to the trader as a card below your answer", so answer in
  aggregate — true until the dashboard became a conversation, after which
  nothing was shown below the answer at all. It also said to name cases by id.
  The prompt now says the answer stands on its own, names a shipment by what it
  is with the id in brackets, and says what to do in words: a step number on its
  own is not an answer.
- **The fallback summary listed every case.** It now leads with the count and
  takes the two or three that need something from you, one line each.
- **The model invented destinations.** Asked about several shipments it carried
  one route across the rest — "the tea to Moscow" when that tea goes to Almaty.
  `unsupportedClaims` only checks numbers and addresses, so `inventedPlaces`
  now checks the gazetteer's places too: a place no digest mentions sends the
  answer back to the deterministic summary. Correct beats fluent.

`modules/shared/text.ts` came out of the same pass: titles set into a sentence
were being lowercased whole, which turned UEISFTO into "ueisfto". Acronyms and
form codes keep their capitals now.

Routing was not the problem: "i want to move tea" reaches intake and answers
*"Tea: is it leaving Uzbekistan or coming in?"*, with export and import offered.


---

## The dashboard, designed as a conversation (2026-09-21)

The chat still looked like components arranged in a panel. It is a conversation
now, in the layout people already know, and the moment a case opens is the
thing the whole page is built around.

### The layout
One centred column, 46rem. Before the first message the column sits in the
middle of the page: a question, a sentence explaining what will happen, the
composer, and four ways in as a list of plain rules rather than chips. After
the first message the composer sticks to the bottom of the window with the page
fading out behind it, and the conversation scrolls above.

A reply has no card, no border and no fill — it is text on the page. Only the
trader's own words get a block of their own, right-aligned. `app/page.tsx` lost
its header: a chat does not need a page title telling you it is a chat, and the
shell's padding is turned off for this route so the composer reaches the bottom.

### The palette, from the subject
The chat has its own tokens, taken from the paperwork the app is about rather
than from a UI kit: ink is the blue-black of a customs stamp (`#14283c`), not a
tinted grey; the page is paper (`#fafaf8`); and the single accent is the
Rishtan blue of Uzbek ceramics (`#0e6a86`), used on the caret, the send button,
the upload target and the one comparison. Nothing else is coloured.

One structural device, used once: the time comparison carries a thin accent
rule down its left side, because that content genuinely is a comparison. Every
other reply is prose.

### What the trader is told when a case opens
Not "case opened". `briefOpening` in `modules/steps/briefing.ts` says what they
asked for, what it costs, what the agents take off it, what can be given now,
and what happens next — every figure from the case itself:

> You're exporting 20 t of tea from Tashkent to Almaty by train.
>
> Published end to end, it runs 48 steps over 3–10 days. 15 of them are filings
> I make myself — with the single window, the railway, customs — which should
> bring it to 3–8 days and take roughly 11 hours of form-filling off you.
>
> 19 documents and 10 details can be given now rather than waiting for the step
> that needs them. Send them whenever you like: I read each one, check it
> against the case, and complete the steps it satisfies as they come due.
>
> Ask me anything about it, or say go and I'll start on the first step.
>
> │ 3–10 days as published
> │ 3–8 days with the agents working
> │ roughly 11 hours of form-filling off you — 15 agent steps × 45 min, an estimate

The saving is named as an estimate because that is what it is (`agentTotal ×
AGENT_STEP_MINUTES`), and the published range is the procedure's own timeframe
against the case's computed ETA.

### Text all the way through
The confirm buttons are gone. A shipment waiting for a yes is opened by the
trader saying so — "go", "yes", "start" — and anything else they type is read as
a question about it, with the shipment still waiting. Import and export both run
this way: "i want to import medicines from istanbul by air" asks which treatment,
how much, and where to, one question at a time.

The only control left in a reply is the upload target, and only while a step is
actually waiting for that document.

Three small wording repairs on the way: a range carried its unit twice ("3 days–10
days"), the saving hedged twice ("roughly about 11 hours"), and the shipment was
being reassembled from display strings when intake had already written the
sentence.

**214 unit + 11 e2e pass** (two e2e tests were checking the old dashboard's
markup and now check the conversation), both builds clean, lint 0/0.

## The chat, text only (2026-09-21, later)

Supersedes the palette and "one comparison" notes above.

- **Asking.** "I want to move tea" is answered with one question covering
  everything still missing: export or import, how it travels, how much, and
  which city to which city (`askForTheRest` in `modules/assistant/say.ts`).
- **The summary before a case opens** is prose: what is being moved, the
  published procedure and its timeframe, and the documents and details it will
  need, named (`needsFor` in `modules/assistant/chat.ts` reads the upfront
  plan). The old "I will only ask for the next document" line is gone. Once the
  case opens, `briefOpening` gives the time saved in a sentence; `comparison` is
  always null.
- **Layout.** A text-only redesign (cream page, serif answers, a live
  "working" line) was tried and reverted at the user's request: the chat is
  back to the previous design - reply cards on the right with the stamp-blue
  edge, the trader's bubble on the left. The reasoning line from the text-only
  version was kept: while a reply has no text, one live line names the current
  `stage` with a shimmer; afterwards it folds into "Worked through N steps in
  Xs", which opens to the list. The three-dot loader shows only before the
  first stage arrives. The tool tray
  (Workflow / Document analysis / Risk analysis / agent cards with a "+"
  chevron) stays removed. The text-only version is kept in the session
  scratchpad only; it is not in the repo.

218 unit + 11 e2e pass, lint clean, both builds clean.

## Open chat, Claude type, responsive shell (2026-09-21, latest)

Supersedes the layout notes above.

- **Name.** The product is "Uzbekistan Trade Platform": the sidebar brand,
  `<title>`, per-page titles and the e2e title check. Model prompts and FAQ
  answers in `modules/` still say "UzTrade" (internal, and the evals match
  on them).
- **Chat.** Laid out like ChatGPT/Claude: the trader's message is a small
  bubble on the right, the answer is open text with no card, and the composer
  (text on top, hint and send underneath) is docked at the bottom. The
  reasoning line stays: live stage with a shimmer, then "Worked through N
  steps". Page `#faf9f5`, ink `#14283c`, accent `#0b6f86`.
- **Type.** Inter for the interface and Source Serif 4 for answers. Both are
  variable fonts self-hosted in `public/fonts/inter` and `public/fonts/source-serif`
  (from `@fontsource-variable/*@5`), with faces in `app/styles/fonts.css` and
  tokens `--font-ui` and `--font-read` in `globals.css`. Answers 15px, UI 13–14px.
- **Icons.** home, book, truck, receipt, help, landmark and bot for the sidebar;
  compose for new chat; paperclip for uploads (`components/icons.tsx`).
- **Responsive.** Below 900px the rail is a drawer (`.sidebar.is-open`) opened
  from a 52px `.mobile-bar` with menu, title and new chat. A scrim, Escape, or
  navigating closes it. The chat then takes `100dvh - 52px`. Buttons in the
  chat, bar and drawer reset the global gradient-pill button style.
- Checked in headless Chrome at 1366×800 and 390×844 (start, working,
  thread, drawer). 218 unit + 11 e2e pass, lint clean, both builds clean.

## Intention before intake, and evals for understanding (2026-09-22)

- **Intention first** (`modules/assistant/intention.ts`). A shipment message is
  one of three things. *estimate*: "how long will tea by train from Tashkent to
  Almaty take?" gets the published time, the agents' critical path, and the
  route's transit and door-to-door time, and opens nothing. *explore*: "I wanna
  move tea?", "I'm planning to…", "can I…" gets every published way with its
  time and what the likeliest one needs, then one question. *start*: explicit
  "open a case…", or every detail at once, gets intake's summary. A case is
  still only opened by the trader's yes (POST /api/intake confirm).
- **Router**: a new `estimate` intent; planning, "wanna", "thinking of",
  "start selling" and a trailing "?" are read as shipments; certificate and
  permit questions go to knowledge; off-topic questions go to `other`.
- **Typos** (`modules/intake/typos.ts`): misspelt goods, places and modes are
  corrected against the app's own vocabulary before routing ("taea by tarain"
  becomes "tea by train"), and the reasoning line shows "Read … as …".
- **Fixes found by the evals**: "to import" was being read as a destination
  (shipment-plan); "cargo by rail" is now the any-cargo service; the nearest-
  category proposal no longer says "Shall I open the case"; procedures first
  needed mid-stream failed to load on the Worker (the registry now remembers
  the request origin).
- **Master data**: the seed now updates what it owns (entity name and type,
  published v1 definitions) instead of `onConflictDoNothing`. Entity types
  follow a hand-checked gold (`evals/gold/entities.json`, with new types
  portal, customs and service), and curly and straight quotes no longer make
  two entities. `npm run db:sync` applies it. It fixed 23 entity types and 2
  stale procedure definitions (1108, 1122) locally.
- **Evals**: `understanding` (57 rows, rules, must be 100%),
  `understanding-model` (5 rows, Groq, 80%, currently 4/5; "tee" is genuinely
  ambiguous), and `masterdata` (15 checks against Postgres). The runner reads
  `apps/.env` and `.env.local`. 148/148 deterministic, 229 unit + 11 e2e, both
  builds clean.

## One theme for every page (2026-09-22)

The dashboard's theme is now the app's theme, through the global tokens in
`app/styles/globals.css`, so every page picks it up without per-page CSS.
- Paper `#faf9f5` with white surfaces, ink `#14283c`, warm rules `#e6e2d8`, and
  the one accent `#0b6f86` (links, eyebrows, chips, buttons, the agent lane).
  The rail darkens to the ink family (`#16304a`).
- Headings `h1`/`h2` use the reading serif (Source Serif 4) at weight 400/500.
  Everything else stays in Inter.
- Buttons are flat stamp-blue with no gradient or glow; shadows are near-flat,
  so a surface is set off by its rule.
- Lanes keep their meaning in quieter hues: trader plum, agent = accent,
  physical olive.
- Also: the procedures search now has the cases toolbar's field and chips;
  entities show an icon per type (government, customs, inspection,
  certification, portal, bank, transport, facility, service); the FAQ says
  "Uzbekistan Trade Platform".
- Checked in headless Chrome on all 9 pages at 1366×800 and 390×844.

## Dashboard: blocks drive the workflow, chat only helps (2026-09-22)

The dashboard (`app/page.tsx` → `components/dashboard/board.tsx`) no longer
runs the workflow through chat. Three blocks, each backed by existing APIs:

1. **Intake block** (`intake-block.tsx`): a line of free text or the fields
   (direction, goods, quantity, mode, from, to). `POST /api/intake/plan`
   (`modules/intake/preview.ts`) corrects typos, runs intake, and returns the
   matched procedure ("I matched this to Export of tea by train, procedure
   868"), its stages, published / with-agents / door-to-door time, and the
   documents it will need. It never opens anything. Choices intake needs
   (clearance or whole import, fresh or dried) are chips. **Start case** sends
   `POST /api/intake` with `confirm`.
2. **Step block** (`step-block.tsx`): the orchestrator's `view.next` from
   `GET /api/cases/[id]/assistant`. It asks only what that step needs (reusing
   `components/chat/needs-form.tsx`: values, forms, documents with
   upload/demo/review, confirmations) plus variant choice. **Complete step** is
   enabled only when `ready`; it posts `action: complete`, and the next step is
   whatever the orchestrator returns (a 422 shows what is missing). Agent steps
   show "the agent is filing this" with a sync button.
3. **Agent blocks** (`agent-blocks.tsx`): Document analysis from
   `view.documents` (fields verified, cross-check mismatches, Explain), Risk
   from `/api/cases/[id]/risk`, Transit & workflow from `/transit` plus the
   KPIs and recent feed. They reload after every action.

The **helper** (`helper.tsx`) is a side panel ("Ask", "Ask about this step",
"Explain"). With a case it uses the case-scoped `action: ask`; without one it
uses `/api/chat`. It never changes the case. The sidebar lists cases (New
shipment and your cases) instead of chats. `?case=UZ-…` selects a case,
`?case=new` shows intake, otherwise the last case is used.
`components/chat/workspace.tsx` is no longer rendered.

Tests: `tests/unit/dashboard/blocks.test.ts` covers intake preview (match,
missing, regime choice, typos) and the step loop against the orchestrator
(refused until ready, next step from the orchestrator). e2e checks the intake
block. Checked in Chrome: line → match → Start case → step 1 (demo contract,
confirm fields, signature) → Complete → step 2, with the document block
flagging the demo contract's 60 t against the case's 15 t. Laptop and phone.
`npm run db:prune-duplicates` (`--ids`, `--through`, `--apply`) removes test
cases with their workflow data.
