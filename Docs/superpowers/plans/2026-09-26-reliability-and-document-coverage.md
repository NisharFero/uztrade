# Reliability, auto-advance and document coverage — plan

Date: 2026-09-26 · Owners: Claude (Claude Code) and Codex, working in parallel.

## What was asked

1. The application must not fail at any stage of the process: intake → case
   opened → every step → case completed.
2. When Document Intelligence has extracted and verified every required detail
   of a step's documents, the step moves on by itself.
3. For all 243 procedures the system must know which documents each step needs
   and which details must be read from each document.
4. Every UI fix and feature is checked, with every kind of test.

## Where it stood on 2026-09-26 (measured, not guessed)

| | |
|---|---|
| Unit tests | 256 / 256 pass (`npm run test:unit`) |
| Trader steps | only ever completed by the trader's "Complete step" click, even with every document verified |
| Cross-check mismatches | shown, but did not stop a step |
| Shipment-document inputs across 243 procedures | 175 distinct labels, 6,385 step uses |
| …mapped to a document spec (fields known) | **44 labels, 2,781 uses (44%)** |
| …not mapped | **131 labels, 3,604 uses (56%)** — upload works, nothing is read or verified |
| Document specs defined | 21 types |

Measure again with `npx tsx scripts/audit/document-coverage.ts`.

The 131 unmapped labels are not all documents. By hand they fall into:

- **real documents with no spec**, e.g. vehicle registration certificate (71 procedures), export
  declaration of the exporter's country (66), certificate on availability of funds (62),
  international passport (56), ATP certificate (56), international carriage authorisation (55),
  TIR carnet (47), cargo delivery control book (41+37), sales and purchase agreement (39),
  invoice (39), driver's licence (27), company charter (17), sanitary-epidemiological conclusion (16)
- **single values mis-read as documents**, e.g. vehicle registration number, warehouse licence
  number, bank card number, cost on the contract, amount of consignment, payment sum
- **section headers mis-read as inputs**, e.g. "Documents requried to complete declaration" (typo
  in the source), "Package of documents", "General information", "Information from following
  documents is required to complete the application"
- **applications the agent drafts**, e.g. application for wagon handover, application on letterhead,
  online application for certificate of origin — these are outputs of a form, not uploads

## Ownership (so the two agents never edit the same file)

| Area | Owner |
|---|---|
| `modules/steps/**`, `modules/workflow/**`, `modules/procedures/requirements.ts`, `modules/documents/specs.ts`, `scripts/audit/**` | **Claude** |
| `tests/e2e/**`, new `tests/ui/**`, `modules/documents/docai/**`, `app/api/**` route hardening, `public/demo/**` | **Codex** |
| `components/**`, `app/styles/**` | Codex may fix bugs it finds; Claude owns the chat cards (`components/chat/result-cards.tsx`, `app/styles/cards.css`) — Codex reports, Claude fixes |

Anything outside your area: write it in your report instead of changing it.

## Claude's tasks

- [x] **C-1 Auto-advance on verified documents** — `autoCompletable()` in `modules/steps/next.ts`, run by the
  orchestrator. A trader step completes itself when its own output document is uploaded and
  verified (proof it happened), or when everything it asks for is documents, all verified with no
  cross-check mismatch, and at least one was handed over at that step. Steps that also need a
  signature, a choice, a typed value or a portal form still wait for "Complete step". Audit event
  `step_auto_completed`; shown in the case feed and in the chat. Four unit tests.
- [x] **C-2 Walk all 243 procedures end to end** — `scripts/audit/walk-procedures.ts` (logic in
  `walk.ts`) opens each procedure in memory, gives every step what its view asks for, and
  completes it. Result: **243 completed, 0 stuck, 0 crashed**. Six representative procedures
  are walked on every unit run (`tests/unit/workflow/walk.test.ts`).
- [x] **C-3 Classify every step input** — `inputShape()` in `modules/procedures/requirements.ts`:
  document / value / application / kept. New headers ("Documents requried…", "Information from
  following documents…", advisory lists) and channels ("To obtain electronic/hard copy", "For
  legal entities/individuals") recognised. **0 unclassified** of 162 labels.
- [x] **C-4 Specs for the real documents** — 14 new specs (vehicle registration, driver's licence,
  ATP, carriage permit, TIR carnet, cargo control book, transit declaration, funds certificate,
  charter, sanitary conclusion, quality certificate, veterinary permit, registration certificate,
  service contract) plus label mappings (international passport, ID card, foreign export
  declaration, sales and purchase agreement, invoice). Documents with fields read: 44% → **66%**
  of step uses; the rest are values (13%), drafted applications (15%) and files the entity
  examines (6%). `tests/unit/documents/coverage.test.ts` fails on any new unclassified label.
  Reference-only specs can still be confirmed as provided at the start of a case.
- [x] **C-5 Document requirements map** — `public/data/document-requirements.json`, from
  `scripts/audit/requirements-map.ts`.

Follow-ups found on the way:

- Demo scenarios regenerated and the 8 generated packs re-rendered (new document types changed
  their file lists). 205 old PNGs in `public/demo/*` are no longer referenced; left in place
  because `public/demo` is Codex's area — delete once Codex's demo work is in.
- The 14 new specs have no specimen; their anchors are standard practice. Codex's DocAI run on
  real files should confirm or correct them (report to Claude).

## Codex's tasks

See the prompt below; it is written to be pasted as is.

## Gate before anything is called done

- `npm run lint`, `npx tsc --noEmit`, `npm run test:unit` all clean
- `npx tsx scripts/audit/walk-procedures.ts` → 243 completed, 0 stuck, 0 crashed
- `npx tsx scripts/audit/document-coverage.ts` → 0 unclassified labels
- Codex's UI suite green at 1366×800 and 390×844, no console errors, no 5xx from any route

---

## Prompt for Codex

```text
You are working in the UzTrade repository (D:\uztrade), a Next.js app (run with vinext) in
apps/web. It is a chat-first platform where a trader describes a shipment, the assistant matches
one of 243 published Uzbek trade procedures, opens a case, and agents take the case through every
step. Read AGENT.md and apps/web/README.md first.

Another agent (Claude) is working in the same repo at the same time. Stay inside your area:

  YOURS:   apps/web/tests/e2e/**, new apps/web/tests/ui/**, apps/web/modules/documents/docai/**,
           apps/web/app/api/** (hardening only), apps/web/public/demo/**
  NOT YOURS (report problems, do not edit): apps/web/modules/steps/**, modules/workflow/**,
           modules/procedures/requirements.ts, modules/documents/specs.ts, scripts/audit/**,
           components/chat/result-cards.tsx, app/styles/cards.css
  Anything else under components/** or app/styles/**: fix a bug only if the fix is small and
  obvious, and list it in your report.

Do not commit, push, or reset. Do not touch the database outside a test run. Do not remove
existing tests.

Goal: prove that nothing fails at any stage and that every feature works, and fix what does not.

TASK 1 — Browser test suite (apps/web/tests/ui/)
Use puppeteer-core with the installed Chrome (C:/Program Files/Google/Chrome/Application/chrome.exe)
against `npm run dev` on http://localhost:3000. Add an npm script "test:ui". Run every scenario at
1366x800 and at 390x844 (isMobile). Fail on any page error, console error, failed request or 5xx.
Wait for a reply to finish by waiting until no .caret, .thinking or .working element is left.
Scenarios:
  a. Start screen: title, composer, four starter cards; each starter card sends its message.
  b. Explore ("I want to import yoghurt from Almaty"): one-line reply, ways card (.ways) with a
     tile per procedure, "Your shipment" facts card with one fact marked asking, answer chips.
     Tapping a way tile sends a message; tapping a filled fact pre-fills the composer.
  c. Estimate ("How long does it take to export tea by train from Tashkent to Almaty?"): ways
     card with bars, follow-up chips.
  d. Cases ("Which shipments are waiting on me?"): cases card rows link to /?case=UZ-…
  e. Knowledge ("Who issues the phytosanitary certificate for tea?"): answer text + source chips.
  f. Intake one question at a time ("I want to export dried apricots"), answering by chips until
     the plan card (.plan) appears; "Open the case" opens it (URL gets ?case=) and the thread shows
     "Opened as case …", the case card, the step card (#current-step) and, when flagged, the risk
     card.
  g. Step card: upload a demo document from apps/web/public/demo/<procedure>/ for the current step,
     confirm a confirmation need, complete a ready step; the next step card appears and the old one
     folds to one line. Assert that a step whose documents are all read and verified moves on
     without clicking "Complete step" (feed line "… read and verified").
  h. Agent rail: every agent button opens its card; "Show me what it needs" scrolls to the target.
  i. Every page renders without errors: /, /procedures, /procedures/868, /cases, /cases/<id>,
     /ledger, /faq, /entities, /agents, /demo/868.
  j. New shipment button resets the thread; navigation rail folds after the first message.
Save screenshots of every scenario to apps/web/tests/ui/output/ (gitignored) and write a short
table of pass/fail per scenario in apps/web/tests/ui/REPORT.md.

TASK 2 — API never answers 500 (apps/web/tests/e2e/api-robustness.test.mjs)
For each of the 34 routes under apps/web/app/api, call every method it exports with: a valid
request, a missing body, malformed JSON, wrong types, an unknown id (e.g. UZ-0000-0000), and
oversize input. Expected: 2xx for valid, 4xx with a JSON {error} for the rest — never 5xx, never
an HTML error page, never a hang over 60 s. Fix route code that fails (validation and error
mapping only; do not change business logic in modules you do not own). Admin/reset must be
skipped unless running against a throwaway database.

TASK 3 — Document Intelligence on real files (modules/documents/docai/**, public/demo/**)
For each document type in modules/documents/specs.ts that has a demo file in public/demo, run the
real upload pipeline (POST /api/cases/<id>/documents) and record which required fields came back
accepted, review or missing. Target: every required field of every demo document accepted, so the
auto-advance fires. Improve extraction (anchors in the reader, normalisation in validate.ts,
reread prompts) where fields are missed; if a field's spec is wrong, report it for Claude instead
of editing specs.ts. Add demo documents for document types that have none. Make sure a document
the reader cannot read, a wrong document type, an empty file, a 15 MB+ file and a non-image/PDF
file each give a clear message and never crash the upload. Record results in
apps/web/tests/ui/DOCAI-REPORT.md.

TASK 4 — Report
Finish with: what you tested, pass/fail counts, every bug found (file:line, how to reproduce,
fixed or reported), and anything in Claude's area that needs a change. Run `npm run lint`,
`npx tsc --noEmit -p apps/web` and `npm run test:unit` in apps/web at the end and include the
output summary.
```
