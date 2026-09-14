# Step Assistant, Document AI and Risk Values — Design

Status: approved 2026-09-13. Builds on the conversational intake spec and the
document specimen research (`Docs/research/2026-09-13-document-specimens-rnd.md`).

## Part A — Step assistant; full workflow lives in Cases & Shipments

### Placement
- **Dashboard:** intake conversation → "Create case & steps" → the chat becomes
  the step assistant for that case. The DAG, document/risk panels and ledger are
  **not** rendered on the dashboard; a link opens the case.
- **Cases & Shipments → case page:** step assistant at the top, then the full
  workflow (DAG, Document Intelligence, Risk & Compliance, ledger). A case can be
  continued from either place.
- Block-level "mark done" and mock current-step completion are removed: every
  completion goes through the gated step API.

### One step at a time
- Next step = the lowest-numbered node that is `needs_input` (open work item);
  others open in parallel are counted ("+3 other steps ready").
- Card: step number, title, who (You / Agent / At the goods), entity, where,
  what the step produces.
- **Needs**, each ✓ or missing:
  - earlier-step documents — filled from the case ledger;
  - documents — **upload**; parsed fields shown with confidence; you confirm or
    correct; required fields must be confirmed;
  - company profile values — asked once, reused;
  - credentials / presence — confirmation;
  - channel variants — choose one.
- **Outputs:** a user/physical step that produces a document asks for that
  document (upload) or its reference number when it completes.

### Pause rule
- User/physical step: the complete call is refused (422 with the missing list)
  until every required item is ✓.
- Agent step: if any trader-supplied input is missing the node goes to
  `needs_input` with a work item of kind `agent_inputs` ("Agent paused at step
  41 — needs Commercial invoice: total value, HS code"). Providing the inputs
  returns the node to `ready`; the orchestrator then runs the agent. Credentials
  on agent steps are covered by the platform's portal integration.

### KPIs
- Steps: total · completed · remaining.
- Agent: steps completed by the agent / agent steps in the procedure.
- ETA: remaining critical path over unfinished blocks (published block
  estimates), shown as a range and a calendar date range.
- Time saved (estimate, formula shown): 45 min per agent-completed step + 1 min
  per value auto-filled from the ledger instead of re-entered.

### Case ledger
Stored as `artifacts` rows: `trader_input` (profile values, confirmations,
variant choice), `document` (upload: R2 key, parsed fields, confirmed values,
checks) and agent outputs. Latest version per key wins.

## Document AI

### Decisions
- Hosted models via the provided Hugging Face key are used where a provider
  hosts them; the layout QA model and a Cyrillic-capable OCR are not hosted, so
  they run locally in `apps/docai` (Python venv, caches on D:), downloaded with
  the Hugging Face key.
- **No external escalation**: low-confidence fields go to the trader's review;
  document content is never sent to Groq.
- **Originals kept** in R2 (binding enabled; simulated locally).

### Pipeline (`apps/docai`, FastAPI)
1. Input: image, or PDF pages rendered with PyMuPDF; pages wider than 1280 px
   are downscaled (same OCR accuracy, a third of the time); small images are not
   upscaled (it added time and read nothing more).
2. OCR: EasyOCR (Russian + English) → words, boxes, confidence.
3. Type check: title keywords vs the expected type.
4. Layout QA: `impira/layoutlm-document-qa` answers one question per field over
   the OCR words and boxes (no Tesseract).
5. Label anchors: bilingual box labels from the specimens give a second
   candidate (value right of / below the label).
6. Returned per field: candidates with source and score.

In the app (`lib/docai/`): validators per field kind (date, INN, HS code, amount,
weight, number, currency, Incoterms, country), composition into value +
confidence, gate (≥0.80 accepted, 0.50–0.80 review, <0.50 missing),
cross-checks against the ledger (quantity vs intake, HS code across documents,
consignee country vs route, contract no vs step 1, receipt amount vs offer).

### Field specs
Rewritten from the specimen research, `source: "specimen"` for fields seen on
the published specimen; each field has key, label, required, kind, questions,
anchors.

### Evaluation
Filled specimens with ground truth (KZ phytosanitary certificate, TD1 customs
declaration, airport prepayment invoice, GU-12, offer agreement) and blank forms
(must yield empty values). Per-field accuracy is reported as measured.

## Part B — Risk & Compliance: title · value · reason

Every row is computed for the case — no generic "why it matters" text:
overall risk, HS classification, procedure, route (distance, transit, crossings,
days), origin proof, transport units, destination requirements with status,
certificate stack with status, document cross-check results, perishability vs
transit, inspection likelihood (stated as not estimable without history), duty
(stated as not computed). Values fill in from intake facts, the shipment plan,
the country fixture, workflow state and the case ledger.

## Demo pack (procedure 868) — added 2026-09-13

Decisions (user): 868 only; demo documents parsed for real with the time shown;
available as "Use demo" buttons in the step assistant and as downloads.

- `app/data/demo/scenario-868.json` — one invented shipment (60 t black tea,
  OOO "Samarkand Choy", Tashkent → Moscow by rail): values for every value
  need, and 38 documents with their labels, steps, output flag and fields.
  Amounts pair up (each receipt equals the bill it pays); quantities equal intake.
- `apps/docai/demo/generate_868.py` renders each document as a readable A4
  page (150 dpi) in the specimen's bilingual labels, DEMO banners top and
  bottom, stamps on stamped copies.
- `lib/demo.ts` maps a need to its demo: outputs by step (each payment has its
  own receipt), inputs by label then document type.
- Step assistant: "Use demo value" saves the value; "Use demo document" fetches
  the page and uploads it through the normal parse path.
- `/demo/868`: every document with a preview and download, and the values table.
- Engine fixes found while mapping: "Customs declaration submitted" is an event,
  not an upload; receipts are checked against the bill issued since the
  previous payment.

## Testing
- Unit: next-step selection, needs/missing with ledger, pause rule for agent
  nodes, 422 on incomplete completion, KPI maths, field composition and
  validators, cross-checks, risk rows for tea 60 t Tashkent→Moscow.
- Docai: evaluation script over specimens; recorded responses used as fixtures
  for deterministic unit tests.
- Browser: create case → step assistant → upload a specimen → confirm fields →
  complete → agent step runs → KPIs update; case page shows the same assistant
  and the full workflow.
