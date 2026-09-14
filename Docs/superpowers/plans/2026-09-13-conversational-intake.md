# Conversational Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Intake gathers what / how / how much / from→to, each validated against published procedures and the supplied country fixture, then confirms before opening a case.

**Architecture:** Pure modules under `apps/web/app/lib/intake/` (draft merge, validators, conversation state machine) behind `POST /api/intake`; the chat holds the draft client-side and renders a progress card and confirm card.

**Tech Stack:** TypeScript, vinext/React 19, node:test via tsx.

**Spec:** `Docs/superpowers/specs/2026-09-13-conversational-intake-design.md`

## Global Constraints

- Nothing is created before the trader confirms.
- Partner countries = `app/data/countries.ts` (KZ, KG, TR, AF, RU, CN); one end always UZ.
- Modes offered only from published procedures for (goods, direction).
- Validators are deterministic; no model call in the conversational path.
- `/api/query` unchanged. Not a git repository: no commit steps.

---

### Task 1: Country fixture
- [x] `app/data/countries.ts` with `COUNTRIES`, `PARTNER_COUNTRIES`, `COUNTRY_FIXTURE_SOURCE`.

### Task 2: Draft + validators + conversation
**Files:** Create `lib/intake/draft.ts`, `lib/intake/validate.ts`, `lib/intake/conversation.ts`; modify `lib/shipment-plan.ts` (export `unitsFor`). Test: `tests/intake-conversation.test.ts`.

**Produces:**
```ts
type Slot = "commodity" | "mode" | "quantity" | "route";
function mergeReply(draft: IntakeDraft, text: string, expecting?: Slot | null): { draft; understood; unsupportedGoods; unknownPlace };
function parseDraft(raw: unknown): IntakeDraft;
function modesFor(category: string, direction: Direction | null): ModeOption[];
function checkQuantity(tonnes: number | null, mode: Mode, category: string): QuantityCheck;
function checkRoute(origin: DraftEnd | null, destination: DraftEnd | null): RouteCheck;
function converse(draft: IntakeDraft, reply: string, options?: { expecting?: Slot | null }): IntakeTurn;
function evaluate(draft: IntakeDraft, prefix?: string[]): IntakeTurn;
```
- [ ] Tests per spec §Testing (move tea → modes; single mode stated; quantity bounds; route rules; route invalidates mode; multi-answer + correction; fixture notes; decline).
- [ ] Implement; tests pass.

### Task 3: API + case opening
**Files:** Create `app/api/intake/route.ts`; modify `lib/case-orchestration-service.ts` (`openCaseFromIntake`).
- [ ] `{message, draft, expecting}` → `converse`; `{draft, confirm: true}` → `evaluate` then open case → `status: "opened"`.
- [ ] Smoke with curl.

### Task 4: Compliance country notes from fixture
**Files:** Modify `lib/compliance.ts`.
- [ ] Replace hard-coded EAEU/CIS/EU sets with fixture profile (origin proof, crossings, applicable destination requirements); existing compliance tests stay green.

### Task 5: Chat UI
**Files:** Modify `app/workspace.tsx`, `app/pages.css`, `package.json`.
- [ ] Progress card (What / How / How much / From → To), question + chips, notes, confirm card with Create case and per-row Change.
- [ ] `npm test`, lint, browser drive: "I want to move tea" → train → 60 tonnes → Tashkent to Moscow → Create case.
