# Procedure Q&A Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add case-aware procedure Q&A to the existing step assistant.

**Architecture:** Create one pure Q&A module that derives answers from `AssistantView`, procedure data, document specs and the commodity taxonomy. Wire it through the existing assistant API and add a compact UI form in the existing step assistant component.

**Tech Stack:** TypeScript, Next/Vinext route handlers, React 19, Node test runner via `tsx --test`.

**Spec:** `Docs/superpowers/specs/2026-09-17-procedure-qa-assistant-design.md`

## Global Constraints

- Do not invent documents, fees, websites or entity SLAs.
- Current-case answers must use the refreshed workflow projection.
- Goods matching must confirm fuzzy corrections before choosing a procedure.
- Keep all new logic deterministic and testable without a model call.

---

### Task 1: Pure Procedure Q&A

**Files:**
- Create: `apps/web/modules/steps/procedure-qa.ts`
- Test: `apps/web/tests/unit/steps/procedure-qa.test.ts`

**Interfaces:**
- Produces: `answerProcedureQuestion(input: ProcedureQaInput): ProcedureQaAnswer`
- Consumes: `AssistantView`, `Procedure`, `WorkflowProjection`, `DOC_SPECS`, `commodityOf`.

- [ ] **Step 1: Write failing tests**

Cover current step, current stage, current docs, document fields, entity timing, tomato/brinjal/apple procedure matching, and fuzzy "tomota".

- [ ] **Step 2: Run tests to verify failure**

Run: `cd apps/web; npm exec -- tsx --test tests/unit/steps/procedure-qa.test.ts`

- [ ] **Step 3: Implement minimal module**

Implement deterministic intent detection using keyword regexes, with structured answers:

```ts
type ProcedureQaAnswer = {
  kind: "answer" | "clarify" | "unsupported";
  title: string;
  message: string;
  bullets: string[];
  procedureId?: string;
  confirmation?: { label: string; value: string };
};
```

- [ ] **Step 4: Run tests to verify pass**

Run the same focused test command.

### Task 2: Assistant API

**Files:**
- Modify: `apps/web/app/api/cases/[id]/assistant/route.ts`
- Test: `apps/web/tests/unit/steps/procedure-qa.test.ts`

**Interfaces:**
- Consumes: `answerProcedureQuestion`.
- Produces: assistant POST `ask` action returning `{ ...AssistantView, answer }`.

- [ ] **Step 1: Add failing API-shape test through the pure response helper or focused route-adjacent assertion**

Assert an answer can be attached without mutating workflow state.

- [ ] **Step 2: Run focused test and verify failure**

Run: `cd apps/web; npm exec -- tsx --test tests/unit/steps/procedure-qa.test.ts`

- [ ] **Step 3: Add `ask` action**

Load projection, build `AssistantView`, call `answerProcedureQuestion`, and return the view with `answer`.

- [ ] **Step 4: Run focused test**

Run: `cd apps/web; npm exec -- tsx --test tests/unit/steps/procedure-qa.test.ts`

### Task 3: Step Assistant UI

**Files:**
- Modify: `apps/web/components/chat/step-assistant.tsx`
- Modify: `apps/web/app/styles/pages.css` or `apps/web/app/styles/panels.css`

**Interfaces:**
- Consumes API response `answer`.
- Produces a visible "Ask about this procedure" form and answer panel.

- [ ] **Step 1: Add minimal UI state and form**

Submit `{ action: "ask", question }` to the existing assistant endpoint.

- [ ] **Step 2: Render the answer**

Show title, message and bullets. Show confirmation text when `kind` is `clarify`.

- [ ] **Step 3: Run type/build or focused unit suite**

Run: `cd apps/web; npm exec -- tsx --test tests/unit/steps/procedure-qa.test.ts tests/unit/steps/assistant.test.ts`

### Task 4: Verification

**Files:**
- No new production files.

- [ ] **Step 1: Run focused unit tests**

Run: `cd apps/web; npm exec -- tsx --test tests/unit/steps/procedure-qa.test.ts tests/unit/steps/assistant.test.ts tests/unit/intake/conversation.test.ts`

- [ ] **Step 2: Run lint/build if feasible**

Run: `cd apps/web; npm run build`

- [ ] **Step 3: Summarize dirty worktree carefully**

Report only files changed for this feature and mention any pre-existing dirty worktree risk.
