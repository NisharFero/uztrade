/* Document Intelligence - what each step NEEDS.
 *
 * Source: section 5 "Inputs required per step" of each procedure document,
 * carried on every step as `inputs`. The source tags every line "[trader
 * supplies]", even documents an earlier step produces, and flattens its
 * structure into one list. This module restores both:
 *
 *   - kind: where the input comes from - the company profile (collected once,
 *     reused on every case), the trader's own credentials, this shipment's
 *     documents, an earlier step's output (a Type 2 dependency the agent can
 *     track), a counterparty's published material, or plain presence;
 *   - structure: "For physical payment" / "For online payment" start
 *     alternative channels; "Data required to complete offer agreement"
 *     starts a group of fields; "Documents that are not obligatory..." makes
 *     what follows optional.
 */

import type { Procedure, ProcedureStep } from "./data/procedures.generated";
import { docTypeOf, type DocType } from "../documents/specs";

export type InputKind = "profile" | "identity" | "case" | "produced" | "published" | "presence";

export const INPUT_KINDS: { kind: InputKind; label: string }[] = [
  { kind: "produced", label: "From an earlier step" },
  { kind: "case", label: "Shipment documents — collected once per case" },
  { kind: "profile", label: "Company profile — collected once" },
  { kind: "identity", label: "Your own credentials" },
  { kind: "published", label: "Published by the entity — the agent looks it up" },
  { kind: "presence", label: "Presence" },
];

export type ProducedBy = { stepNum: number; title: string; output: string };

export type StepInput = {
  label: string;
  kind: InputKind;
  optional: boolean;
  /** The header this input sits under, e.g. "Data required to complete offer agreement". */
  group: string | null;
  docType: DocType | null;
  producedBy: ProducedBy | null;
};

export type StepVariant = { label: string; inputs: StepInput[] };

export type StepNeeds = {
  stepNum: number;
  title: string;
  /** Needed whichever channel is used. */
  common: StepInput[];
  /** Alternative channels - the trader satisfies ONE of these. */
  variants: StepVariant[];
};

const VARIANT = /^for (physical payment|online payment|submitting application)/i;
/* Road procedures (161, 57) add their own headings: "Information required to
 * complete transit declaration", "Documents related to the vehicle", "For
 * issuance of Cargo delivery control book", "Not obligatory documents". */
const GROUP =
  /^(data required|documents? requi|required documents|documents that are not obligatory|not obligatory documents|to access the platform|certificates and permits|information required to complete|documents (related to|of the|attached to)|for (issuance|clearance|concluding)|if cargo operat)/i;
const OPTIONAL_GROUP = /not obligatory/i;

const PRESENCE = /^(physical presence|availability by phone|internet access)$/i;
const IDENTITY = /electronic digital signature|one id account|online banking account/i;
const PUBLISHED = /bank details of territorial customs|^guiding letter \(template\)$|^instruction on completing|^guarantees and fees$/i;
const PROFILE =
  /tax identification number|personal identification number|^name of the organi[sz]ation$|full name of an organi[sz]ation|^contact phone number$|^email$|^agency region$|^type of organi[sz]ation|^passport$|power of attorney|^bank details$|certificate of state registration|^stamp$|^information about applicant$/i;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

/* When the input and the producing step's output are worded differently.
 * [input, output] - tried only after an exact match fails. */
const PRODUCED_ALIASES: [RegExp, RegExp][] = [
  [/^certificate on passing examination$/, /^passing examination$/],
  [/^certificate of origin (form a|general form)$/, /^certificate of origin$/],
  [/^(export|import) customs declaration$/, /^customs declaration submitted$/],
  [/^invoice for payment for railway services$/, /^information on cost amount$/],
  [/^offer agreement for /, /^offer agreement$/],
  [/^receipt of payment$/, /^bank payment receipt$|^receipt of payment/],
];

/** Header lines are structure, not inputs. */
export function isHeader(label: string): "variant" | "group" | null {
  if (VARIANT.test(label)) return "variant";
  if (GROUP.test(label)) return "group";
  return null;
}

const stepsOf = (procedure: Procedure): ProcedureStep[] =>
  procedure.blocks.flatMap((b) => b.steps).sort((a, b) => a.num - b.num);

/** The nearest earlier step whose output this input is. */
function producerOf(label: string, earlier: ProcedureStep[]): ProducedBy | null {
  const wanted = norm(label);
  const nearestFirst = [...earlier].reverse();
  const exact = nearestFirst.find((s) => s.output && norm(s.output) === wanted);
  const aliased =
    exact ??
    nearestFirst.find((s) => s.output && PRODUCED_ALIASES.some(([i, o]) => i.test(wanted) && o.test(norm(s.output))));
  return aliased ? { stepNum: aliased.num, title: aliased.title, output: aliased.output } : null;
}

export function classifyInput(label: string, earlier: ProcedureStep[] = []): { kind: InputKind; producedBy: ProducedBy | null } {
  if (PRESENCE.test(label)) return { kind: "presence", producedBy: null };
  if (IDENTITY.test(label)) return { kind: "identity", producedBy: null };
  if (PUBLISHED.test(label)) return { kind: "published", producedBy: null };
  if (PROFILE.test(label)) return { kind: "profile", producedBy: null };
  const producedBy = producerOf(label, earlier);
  return producedBy ? { kind: "produced", producedBy } : { kind: "case", producedBy: null };
}

function variantLabel(header: string): string {
  const text = header.replace(/^for\s+/i, "").replace(/\s*\([^)]*\)/g, "").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function needsOfStep(step: ProcedureStep, earlier: ProcedureStep[]): StepNeeds {
  const common: StepInput[] = [];
  const variants: StepVariant[] = [];
  let bucket = common;
  let group: string | null = null;

  for (const label of step.inputs) {
    const header = isHeader(label);
    if (header === "variant") {
      const variant = { label: variantLabel(label), inputs: [] };
      variants.push(variant);
      bucket = variant.inputs;
      group = null;
      continue;
    }
    if (header === "group") {
      group = label;
      continue;
    }
    // The source repeats lines inside one list ("Physical presence" twice).
    if (bucket.some((i) => i.label === label)) continue;
    const { kind, producedBy } = classifyInput(label, earlier);
    bucket.push({
      label,
      kind,
      optional: Boolean(group && OPTIONAL_GROUP.test(group)),
      group,
      docType: docTypeOf(label),
      producedBy,
    });
  }

  return { stepNum: step.num, title: step.title, common, variants };
}

export function stepNeeds(procedure: Procedure, stepNum: number): StepNeeds {
  const steps = stepsOf(procedure);
  const step = steps.find((s) => s.num === stepNum);
  if (!step) throw new Error(`Procedure ${procedure.id} has no step ${stepNum}`);
  return needsOfStep(step, steps.filter((s) => s.num < stepNum));
}

export function procedureNeeds(procedure: Procedure): StepNeeds[] {
  const steps = stepsOf(procedure);
  return steps.map((step, index) => needsOfStep(step, steps.slice(0, index)));
}

export const allInputs = (needs: StepNeeds): StepInput[] => [...needs.common, ...needs.variants.flatMap((v) => v.inputs)];

export type CollectOnce = { label: string; kind: InputKind; docType: DocType | null; steps: number[] };

/** What the platform collects ONCE and reuses: the profile (and the trader's
 *  credentials) across every case, the shipment documents across this case.
 *  Without it a 48-step procedure asks for the same TIN at four steps. */
export function collectOnce(procedure: Procedure): { profile: CollectOnce[]; case: CollectOnce[] } {
  const tally = new Map<string, CollectOnce>();
  for (const needs of procedureNeeds(procedure)) {
    for (const input of allInputs(needs)) {
      if (input.kind !== "profile" && input.kind !== "identity" && input.kind !== "case") continue;
      const entry = tally.get(input.label) ?? { label: input.label, kind: input.kind, docType: input.docType, steps: [] };
      if (!entry.steps.includes(needs.stepNum)) entry.steps.push(needs.stepNum);
      tally.set(input.label, entry);
    }
  }
  const byUse = (a: CollectOnce, b: CollectOnce) => b.steps.length - a.steps.length || a.label.localeCompare(b.label);
  const all = [...tally.values()].sort(byUse);
  return {
    profile: all.filter((e) => e.kind !== "case"),
    case: all.filter((e) => e.kind === "case"),
  };
}

/** Earlier-step documents this step is still waiting on. */
export function waitingOn(needs: StepNeeds, isCompleted: (stepNum: number) => boolean): StepInput[] {
  return allInputs(needs).filter((i) => !i.optional && i.producedBy && !isCompleted(i.producedBy.stepNum));
}
