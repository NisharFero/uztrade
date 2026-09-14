# Intake, Document Intelligence and Risk Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Intake resolves a query to one procedure plus its step plan; Document Intelligence and Risk & Compliance state, as points, exactly what they need.

**Architecture:** Pure TypeScript modules under `apps/web/app/lib/` (intake pipeline, requirements classifier, document specs, risk rules) over the generated procedure data, extended with §5 inputs parsed from the .docx files. API routes add fields; panels render the new lists.

**Tech Stack:** TypeScript, vinext/React 19, node:test via tsx, Groq (OpenAI-compatible) LLM optional.

**Spec:** `Docs/superpowers/specs/2026-09-13-intake-docintel-risk-agents-design.md`

## Global Constraints

- Final procedure id comes from the lookup table, never raw model output.
- Fields not in the procedure source are tagged `reference`; no duty rate shown.
- `/api/query` existing fields keep their shapes; new fields are additive.
- Works with no API key (rules path).
- The workspace is not a git repository: no commit steps.
- Test commands run from `apps/web`: `npx tsx --test tests/<file>.test.ts`; full: `npm test`.

---

### Task 1: §5 inputs in the procedure data

**Files:**
- Create: `apps/web/scripts/extract-inputs.mjs` (done), `apps/web/scripts/inputs-data.json` (generated)
- Modify: `apps/web/scripts/build-procedures.mjs` (merge `inputs` into steps; add `inputs: string[]` to `ProcedureStep`)
- Test: `apps/web/tests/requirements.test.ts`

**Produces:** `ProcedureStep.inputs: string[]`.

- [ ] Test: per-procedure input totals equal 181/181/218/160/181 for 306/325/477/540/868; every step has an `inputs` array.
- [ ] Run → fails (no `inputs`).
- [ ] Merge by step number in build script; throw if §5 step title set is missing a step.
- [ ] `npm run data:build`; test passes.

### Task 2: Requirements classifier (Document Intelligence, level A)

**Files:**
- Create: `apps/web/app/lib/requirements.ts`
- Test: `apps/web/tests/requirements.test.ts`

**Produces:**
```ts
type InputKind = "profile" | "identity" | "case" | "produced" | "presence";
type StepInput = { label: string; kind: InputKind; producedBy?: { stepNum: number; title: string; output: string }; variant?: string; group?: string; docType?: DocType };
type StepNeeds = { stepNum: number; title: string; inputs: StepInput[]; variants: string[] };
function classifyInput(label: string): InputKind | "variant" | "group";
function stepNeeds(procedure: Procedure, stepNum: number): StepNeeds;
function procedureNeeds(procedure: Procedure): StepNeeds[];
function profileFields(procedure: Procedure): string[]; // collected once
```

- [ ] Tests: every label across the five procedures classifies (no fallthrough to an unknown kind); 325 step 41 → SMGS produced by 40, phytosanitary certificate by 36, certificate of origin by 30; 325 step 4 variants = physical/online payment; 325 step 15 group fields (TIN, organisation name…) are `profile`; produced links only point to earlier steps.
- [ ] Implement label rules + normalised output matching with alias table.
- [ ] Tests pass.

### Task 3: Document field checklists (level B)

**Files:**
- Create: `apps/web/app/lib/document-specs.ts`
- Test: `apps/web/tests/document-specs.test.ts`

**Produces:**
```ts
type DocType = "commercial_invoice" | "packing_list" | "trade_contract" | "railway_bill" | "air_waybill" | "phytosanitary_certificate" | "certificate_of_origin" | "receipt_of_payment" | "power_of_attorney" | "offer_agreement" | "quarantine_permit" | "customs_declaration" | "passport";
type DocField = { name: string; source: "procedure" | "reference" };
type DocSpec = { type: DocType; name: string; fields: DocField[]; checks: string[] };
function docTypeOf(label: string): DocType | null;
function specFor(type: DocType): DocSpec;
```

- [ ] Tests: every `case`/`produced` document appearing ≥2× across procedures maps to a spec; the offer-agreement spec's procedure-sourced fields equal the §5 group items; every spec has ≥1 check; receipt check names `<case>-P<step>`.
- [ ] Implement.
- [ ] Tests pass.

### Task 4: Intake agent pipeline

**Files:**
- Create: `apps/web/app/lib/intake/{taxonomy,relevance,lookup,plan,resolve}.ts`
- Modify: `apps/web/app/lib/classify.ts` (use taxonomy + lookup; `Match` gains `slots`, `plan`, `missing`, `candidates`)
- Test: `apps/web/tests/intake-agent.test.ts`; existing `procedure-classification`, `intake-actions` tests stay green

**Produces:**
```ts
type Category = "tea" | "dried fruits" | "fresh fruits and vegetables";
function commodityOf(text: string): { category: Category; term: string; hs: string } | { ambiguous: Category[]; term: string } | { unsupported: string } | null;
function isTradeQuery(text: string): boolean;
function lookupProcedure(category: Category, direction?: Direction, mode?: Mode): string[]; // candidate ids
type PlanStep = { num; title; lane; action; entity; channel; optional; alternative; needs: StepNeeds };
type StepPlan = { procedureId; tracks: { blockId; name; dependsOn; parallelWith: string[]; steps: PlanStep[] }[]; counts: Record<Lane, number> };
function buildStepPlan(procedure: Procedure): StepPlan;
```

- [ ] Tests: grapes→325, raisins→306, "dried apricots"→306, "apricots" → clarify fresh/dried, "import tea by train"→477, "export tea by air"→540, "sell cotton" → declined naming cotton, "what is the weather" → declined as off-topic, plan for 325 has 48 steps with 10 tracks and b1 parallel with other roots, LLM-proposed id that disagrees with the lookup is overridden.
- [ ] Implement.
- [ ] Tests pass (new + existing).

### Task 5: Risk & Compliance — needs, evidence, unresolved

**Files:**
- Modify: `apps/web/app/lib/compliance.ts`
- Test: `apps/web/tests/compliance-risk.test.ts`

**Produces:**
```ts
type RiskInput = { key: string; label: string; why: string; value: string | null };
type RiskFlag = { label; severity; reason; evidence: string[] };
type Unresolved = { input: string; blocks: string };
function assessCompliance(procedure: Procedure, facts?: Partial<ShipmentFacts>, query?: string): ComplianceAssessment & { inputs: RiskInput[]; unresolved: Unresolved[]; ruleKey: string };
```

- [ ] Tests: ruleKey `tea×export` vs `tea×import`; 868 evidence includes certificate of origin, 477 includes quarantine permit, disjoint certificate stacks; no destination → unresolved names origin-certificate form; destination Kazakhstan → EAEU note; still no `dutyRangePct`.
- [ ] Implement.
- [ ] Tests pass.

### Task 6: API + panels

**Files:**
- Modify: `apps/web/app/api/query/route.ts`, `apps/web/app/workspace.tsx`, `apps/web/app/components/document-panel.tsx`, `apps/web/app/components/compliance-panel.tsx`, `apps/web/app/cases/[id]/case-board.tsx`, `apps/web/app/panels.css`, `apps/web/package.json` (register new tests)

- [ ] `/api/query` returns `slots`, `plan` summary, `missing`, `candidates`.
- [ ] Document panel: "What this step needs" for active steps (grouped by kind, variants shown as "either"), expandable field checklist per document.
- [ ] Risk panel: "Needed to assess" list with values or "missing", flags with evidence bullets, unresolved list.
- [ ] Workspace: step-plan summary line after resolution.
- [ ] `npm test`, `npm run lint`; drive `/` and a case page in Playwright.
