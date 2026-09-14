# Intake, Document Intelligence and Risk & Compliance Agents — Design

Status: approved 2026-09-13. Implements §1, §4.1, §5 (document requirements) and
§6.2–6.3 of the Business Requirements & System Design brief against the five
in-scope procedures (306, 325, 477, 540, 868).

## Goal

1. **Intake** turns one free-text query into exactly one procedure *and the
   ordered step plan to follow*, or asks for the single missing dimension, or
   declines. It never guesses silently.
2. **Document Intelligence** states, in points, what every step needs and what
   every document must contain.
3. **Risk & Compliance** states, in points, what it needs to assess a case,
   which conclusions it cannot reach without it, and which evidence each risk
   flag requires — with rules indexed by `(commodity category × direction)`.

## Constraints

- The final `procedure_id` comes from a deterministic lookup, never raw model
  output. The LLM only extracts slots.
- Nothing is invented: document fields not listed in the procedure source are
  tagged `reference` (international trade practice), never presented as the
  procedure's own requirement. No duty rate is shown.
- `/api/query` stays backward-compatible (`matched`, `reason`, `clarify`,
  `procedureId`, `shipment`, `dag` keep their shapes); new fields are additive.
- Works with no API key (rules path) so CI stays deterministic.

## 1. Intake agent — `app/lib/intake/`

| Stage | Module | Output |
|---|---|---|
| Relevance gate | `relevance.ts` | `declined` for off-topic text before any lookup |
| Slot extraction | `slots.ts` (+ LLM in `classify.ts`) | `{commodity, direction, mode, quantity, unit, origin, destination, destinationCountry}` |
| Commodity taxonomy | `taxonomy.ts` | term → `{category, hsHeading}`; `ambiguous` for fresh-vs-dried terms (apricot, plum, fig…) |
| Procedure lookup | `lookup.ts` | `(category, direction, mode)` → procedure id; the table is the authority |
| Clarification | `resolve.ts` | asks only the missing slot; after 2 follow-ups offers top-3 candidates by title |
| Step plan | `plan.ts` | ordered blocks → steps with lane, action, parallel track, alternative/optional, required inputs |

Result contract:

```ts
type IntakeResult =
  | { status: "resolved"; procedureId; slots; rationale: string[]; plan: StepPlan }
  | { status: "clarify"; missing: Slot; question; options; slots; candidates? }
  | { status: "declined"; reason; slots };
```

`classify()` keeps returning `Match` (built from `IntakeResult`) so existing
callers and tests keep working; `Match` gains `slots` and `plan`.

Rules carried over from `settleMatch`: direction from words, then from the
route; no mode + known quantity → load picks the mode; stated mode/direction
with no procedure → refused plainly.

## 2. Document Intelligence — what is needed

### 2a. Step inputs (source: `.docx` §5 "Inputs required per step")

- `scripts/extract-inputs.mjs` parses §5 of each docx once into committed
  `scripts/inputs-data.json` (`{id: {steps: [{num, title, inputs: [label]}]}}`).
- `build-procedures.mjs` merges inputs into `procedures.generated.ts`
  (`step.inputs: string[]`).
- `app/lib/requirements.ts` classifies every input label:

| Kind | Examples | Collected |
|---|---|---|
| `profile` | TIN, organisation name, manager name, phone, email, region, passport, power of attorney, bank details | once, onboarding |
| `identity` | Electronic digital signature, One ID account | once, trader's own credential |
| `case` | payment sum, quantity of transport units, commercial invoice, packing list, contract | once per case |
| `produced` | Export railway bill (SMGS) ← step 40, Phytosanitary certificate ← step 36 | by an earlier step (Type 2) |
| `presence` | Physical presence, availability by phone, internet access | not a document |
| `variant` | "For physical payment", "For online payment…", "For submitting application by emails…" | groups the items that follow into alternative channels |
| `group` | "Data required to complete offer agreement" | header for the field list that follows |

Type 2 links are found by normalised name match of the input against outputs
of *earlier* steps in the same procedure (plus a small alias table, e.g.
"Certificate of origin" ← "Certificate of origin"/"Expert conclusion" route).

### 2b. Document field checklists — `app/lib/document-specs.ts`

For each document type: required fields (`source: "procedure" | "reference"`)
and cross-document consistency checks. Covered: commercial invoice, packing
list, foreign trade contract, SMGS / railway bill, phytosanitary certificate,
certificate of origin, receipt of payment, power of attorney, offer agreement,
quarantine permit application, customs declaration.

Checks include: invoice quantity/value = declaration; consignee = contract
buyer; certificate of origin and phytosanitary goods description = invoice;
receipt reference = `<case>-P<step>`; contract ID = UEISFTO registration number.

### 2c. Readiness

`stepNeeds(procedure, stepNum)` returns the grouped list. A step is not ready
while a `produced` input's source step is incomplete (surfaced in the panel as
"Waiting on step N — <document>").

## 3. Risk & Compliance — `app/lib/compliance.ts` (extended)

**Inputs needed** (each with why): HS heading, direction, mode, origin,
destination country, transit countries, quantity, packaging material,
perishability. Missing inputs produce `unresolved` items naming the conclusion
that cannot be reached (e.g. destination unknown → origin-certificate form
cannot be chosen).

**Rules indexed by `(category × direction)`**; each flag carries `evidence`:
the documents (and fields) that must exist. 868 (tea export) and 477 (tea
import) yield disjoint certificate stacks.

**Country fixture** (advisory, labelled "verify"): EAEU members, CIS-FTA
origin form, Iran approval letter (rail via Iran), EU/GSP origin form, wooden
packaging → ISPM 15.

## 4. API and UI

- `/api/query`: adds `slots`, `plan` (resolved), `missing`, `candidates`
  (clarify).
- Case page: Document panel shows "This step needs" as grouped bullets for
  active steps + field checklist per document; Risk panel shows "Needed to
  assess", flags with evidence, unresolved items.
- Workspace chat: shows the step plan summary after a resolved query.

## 5. Testing

- Intake: all five procedures; fresh vs dried (grapes/raisins/apricots);
  import vs export tea; off-topic decline; missing-slot clarify; candidate
  fallback.
- Inputs: §5 counts per procedure match the source; every label classifies;
  325 step 41 links to steps 30/31, 36, 40.
- Document specs: every `case`/`produced` document used by a procedure has a
  spec or is explicitly listed as spec-less.
- Risk: 868 vs 477 different evidence stacks; missing destination → unresolved.
- Existing suite stays green; browser check of the case page and chat.
