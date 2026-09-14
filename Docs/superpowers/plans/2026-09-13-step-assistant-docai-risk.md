# Step Assistant, Document AI and Risk Values Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cases run one step at a time in a chat with upload-and-parse document gating, KPIs, and a Risk & Compliance view of computed values.

**Architecture:** `apps/docai` (FastAPI: EasyOCR + LayoutLM document QA + label anchors) returns field candidates; `apps/web/app/lib/docai` validates, scores, gates and cross-checks; `lib/steps` derives the next step, needs, pause state and KPIs from the workflow projection and a ledger of artifacts; the orchestrator pauses agent nodes until inputs exist; the step assistant renders on the dashboard and the case page; `lib/risk.ts` computes title/value/reason rows.

**Tech Stack:** Python 3.11, PyTorch CPU, Transformers, EasyOCR, PyMuPDF, FastAPI; TypeScript, vinext/React 19, D1, R2, node:test.

**Spec:** `Docs/superpowers/specs/2026-09-13-step-assistant-docai-risk-design.md`

## Global Constraints

- Local model inference; model downloads authenticated with the HF key; no document content sent to external APIs.
- Venv, pip cache, temp and model caches under `apps/docai/` on D:.
- Originals stored in R2 (`DOCS` binding).
- Gate: ≥0.80 accepted, 0.50–0.80 review, <0.50 missing; required fields must be confirmed.
- Time saved = 45 min × agent-completed steps + 1 min × auto-filled values (formula shown).
- Not a git repository: no commit steps.

---

### Task 1: Document AI service
**Files:** `apps/docai/{pipeline.py, app.py, download_models.py, requirements.txt, run.ps1, run.sh, README.md}`
- [ ] Install venv; download models; `/health`; `/parse` on a specimen returns candidates.

### Task 2: Field specs from R&D + app-side document intelligence
**Files:** `app/lib/document-specs.ts` (rewrite), `app/lib/docai/{validate,compose,doctype,crosscheck,client}.ts`; tests `tests/docai.test.ts`.
- [ ] Validators (date, INN, HS, amount, weight, currency, Incoterms, country), composition + gate, type detection, cross-checks — unit tests with recorded candidates.

### Task 3: Ledger, next step, pause rule, KPIs
**Files:** `app/lib/steps/{ledger,next,kpis}.ts`; modify `app/agents/orchestrator.ts`, `app/lib/workflow-repository.ts` (transition), tests `tests/step-assistant.test.ts`.
- [ ] Agent node pauses with `agent_inputs` work item when inputs missing and resumes when present; user completion refused while needs missing; KPI maths.

### Task 4: APIs + storage
**Files:** `.openai/hosting.json` (r2), `app/api/cases/[id]/assistant/route.ts`, `app/api/cases/[id]/documents/route.ts`, `app/api/cases/[id]/documents/[docId]/file/route.ts`.
- [ ] Upload → R2 → docai → compose → artifact; value/confirm/variant/confirm-document/complete actions.

### Task 5: UI
**Files:** `app/components/step-assistant.tsx`, `app/workspace.tsx`, `app/cases/[id]/page.tsx`, `app/cases/[id]/case-board.tsx`, `app/components/step-needs.tsx`, CSS.
- [ ] Dashboard shows assistant only; case page shows assistant + full workflow; block completion removed.

### Task 6: Risk & Compliance values
**Files:** `app/lib/risk.ts`, `app/components/compliance-panel.tsx`, tests `tests/risk-values.test.ts`.
- [ ] Rows for tea 60 t Tashkent→Moscow match the design table; document mismatches surface.

### Task 7: Evaluation + verification
**Files:** `apps/web/scripts/eval-docai.ts`, `apps/docai/eval/ground-truth.json`.
- [ ] Per-field accuracy on filled specimens; blank-form false positives; full suite; browser run.
