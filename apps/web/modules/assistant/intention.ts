/* What the trader means to do, before intake asks them anything.
 *
 * The router says a message is about moving goods. That covers three quite
 * different things, and answering them the same way is what made the chat feel
 * like a form:
 *
 *   estimate  "How long will it take to move tea by train from Tashkent to
 *             Almaty?" - a question with an answer. Say how long, from the
 *             published procedure and the route; open nothing, ask nothing.
 *   explore   "I want to move tea", "I'm planning to export apricots" - someone
 *             finding out. Say what it involves (which procedures, how long,
 *             what they will need), then ask for the details in one question.
 *   start     "Open a case for 20 t of tea to Almaty by train", or a message
 *             that already carries every detail, or an answer to the question
 *             intake is waiting on - intake proper.
 *
 * None of the three opens a case. A case is only ever opened by the trader
 * saying yes to the summary (POST /api/intake with confirm), which is the
 * point: intention first, then inputs, then consent.
 *
 * Everything said here comes from the catalogue and the procedure files - the
 * published timeframe, the step count, the upfront plan - and from the route
 * model in shipment-plan.ts. Nothing is estimated by a language model.
 */

import { EMPTY_DRAFT, isEmptyDraft, mergeReply, type IntakeDraft, type Slot } from "../intake/draft";
import { lookupProcedures, pickProcedure, type Direction, type Mode } from "../intake/lookup";
import { buildShipmentPlan, type Hours, type RouteEnd } from "../intake/shipment-plan";
import { commodityOf } from "../intake/taxonomy";
import { CATALOGUE, type ProcedureSummary } from "../procedures/data/procedures.generated";
import { requireProcedure } from "../procedures/registry";
import { buildLedger } from "../steps/ledger";
import { upfrontPlan } from "../steps/upfront";
import type { ShipmentFacts } from "../workflow/domain";

export type Goal = "estimate" | "explore" | "start";

/** Asking how long, not saying what to do. */
export const ESTIMATE_QUESTION =
  /\bhow (long|much time|many (days|hours|weeks))\b|\bhow much (will |would |does )?it (will |would )?take\b|\b(will|would|does) it take\b|\b(time ?frame|timeline|lead ?time|transit time|turnaround|duration|eta)\b|\bwhen (will|would|could|can|does|do) (it|they|the (goods|cargo|shipment)|my (goods|cargo)) (arrive|reach|get there|be (there|delivered))\b|\bhow (fast|quickly)\b/i;

/** Asking for the case to be opened, in so many words. */
const START_WORDS =
  /\b(open|create|start|begin|set up|register|book)\b[^.?!]{0,24}\b(case|shipment|consignment|procedure)\b|\blet'?s (start|begin|go|do (it|this))\b|\b(start|begin) (it|now|right away)\b/i;

/** The slots that make a shipment complete enough to summarise. */
const CORE: Slot[] = ["commodity", "direction", "mode", "quantity", "route"];

/** Which way the goods go, from the words or, failing that, from the route. */
export function directionOf(draft: IntakeDraft): Direction | null {
  if (draft.statedDirection) return draft.statedDirection;
  // A country alone ("to Turkey") is an assumed city but a certain country,
  // and the country is all the direction needs.
  const from = draft.origin?.country ?? null;
  const to = draft.destination?.country ?? null;
  if (from === "UZ" && to !== "UZ") return "export";
  if (to === "UZ" && from !== "UZ") return "import";
  // One foreign end is enough: "cheese coming from Almaty" is coming in.
  if (from && !to) return "import";
  if (to && !from) return "export";
  return null;
}

/** "customs clearance for cheese" - the trader means the clearance, not the
 *  whole import, even before intake has asked which treatment. */
const CLEARANCE_WORDS = /\b(customs )?clearance\b|\bclear(ing)? (it|them|the goods|customs)\b/i;

/** The details a message (and the draft behind it) has already given. */
export function givenSlots(draft: IntakeDraft): Set<Slot> {
  const given = new Set<Slot>();
  if (draft.commodity) given.add("commodity");
  if (directionOf(draft)) given.add("direction");
  if (draft.mode) given.add("mode");
  if (draft.quantity) given.add("quantity");
  if (draft.origin && !draft.origin.assumed && draft.destination && !draft.destination.assumed) given.add("route");
  return given;
}

/** The draft the message would make, without committing to it. */
export const draftWith = (draft: IntakeDraft, message: string, expecting: Slot | null = null): IntakeDraft =>
  mergeReply(draft, message, expecting).draft;

/**
 * What a shipment message is for. `expecting` is the intake question waiting
 * for an answer; a message answering it is always intake's.
 */
export function goalOf(message: string, draft: IntakeDraft, expecting: Slot | null): Goal {
  const next = draftWith(draft, message, expecting);
  const hasGoods = Boolean(next.commodity) || commodityOf(message).kind !== "none";
  if (ESTIMATE_QUESTION.test(message) && hasGoods) return "estimate";
  if (START_WORDS.test(message)) return "start";
  // Mid-conversation, a message is an answer to what was asked.
  if (expecting || !isEmptyDraft(draft)) return "start";
  // Everything said at once: go straight to the summary (which still asks).
  const given = givenSlots(next);
  if (CORE.every((slot) => given.has(slot))) return "start";
  return "explore";
}

/* ---------------------------------------------------------- estimate --- */

export type EstimateOption = {
  procedureId: string;
  title: string;
  direction: Direction;
  mode: Mode;
  steps: number;
  /** The published end-to-end timeframe, in hours. */
  published: Hours;
  /** The critical path through the procedure's blocks, run in parallel and
   *  sized for the load: what the paperwork takes with the agents on it. */
  paperwork: Hours;
  /** Moving the goods, when both ends are known. */
  transit: Hours | null;
  doorToDoor: Hours | null;
  distanceKm: number | null;
  borders: number | null;
};

export type Estimate = {
  goods: string;
  category: string;
  from: string | null;
  to: string | null;
  options: EstimateOption[];
  /** What was assumed or could not be worked out, said plainly. */
  assumed: string[];
  /** The details that would sharpen the answer. */
  missing: Slot[];
  /** The way the trader named is not published for these goods; the options
   *  are the ways that are. */
  unpublished: { mode: Mode | null; direction?: Direction } | null;
};

/** Procedures the draft could mean, narrowed by whatever it states. At most
 *  one per direction and mode, so the answer is a short list. */
export function candidatesFor(draft: IntakeDraft, message = ""): ProcedureSummary[] {
  if (!draft.commodity) return [];
  const direction = directionOf(draft);
  const regime = draft.regime ?? (CLEARANCE_WORDS.test(message) ? "clearance" : null);
  const ids = lookupProcedures(draft.commodity.category, direction, draft.mode, null);
  // With no treatment named, the whole export/import is what "move" means.
  const preferred = ids.filter((id) => CATALOGUE[id].regime === (regime ?? "standard"));
  const pool = preferred.length ? preferred : ids;
  const groups = new Map<string, string[]>();
  for (const id of pool) {
    const p = CATALOGUE[id];
    const key = `${p.direction}:${p.mode}`;
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  const order = (p: ProcedureSummary) => (p.direction === "export" ? 0 : 1) * 10 + ["train", "road", "air", "any"].indexOf(p.mode);
  return [...groups.values()]
    .map((group) => pickProcedure(group))
    .filter((p): p is ProcedureSummary => Boolean(p))
    .sort((a, b) => order(a) - order(b));
}

export async function estimateFor(message: string, draft: IntakeDraft = EMPTY_DRAFT): Promise<Estimate | null> {
  const next = draftWith(draft, message);
  if (!next.commodity) return null;
  let candidates = candidatesFor(next, message);
  // "Tomatoes by air" when no procedure moves tomatoes by air: say so, and
  // give the ways that are published rather than nothing at all.
  let unpublished: Estimate["unpublished"] = null;
  if (!candidates.length && next.mode) {
    candidates = candidatesFor({ ...next, mode: null }, message);
    if (candidates.length) unpublished = { mode: next.mode };
  }
  if (!candidates.length && directionOf(next)) {
    const direction = directionOf(next)!;
    candidates = candidatesFor({ ...next, mode: null, statedDirection: null, origin: null, destination: null }, message);
    if (candidates.length) unpublished = { mode: next.mode, direction };
  }
  candidates = candidates.slice(0, 6);
  const facts: ShipmentFacts = {
    goods: next.commodity.term,
    quantity: next.quantity?.value ?? null,
    unit: next.quantity?.unit ?? null,
    origin: next.origin && !next.origin.assumed ? next.origin.name : null,
    destination: next.destination && !next.destination.assumed ? next.destination.name : null,
    mode: next.mode,
  };

  const options: EstimateOption[] = [];
  let ends: { origin: RouteEnd; destination: RouteEnd } | null = null;
  for (const summary of candidates) {
    const procedure = await requireProcedure(summary.id);
    const plan = buildShipmentPlan(procedure, facts, message);
    if (!ends && plan.route) ends = plan.route;
    options.push({
      procedureId: summary.id,
      title: summary.title,
      direction: summary.direction as Direction,
      mode: (summary.mode === "any" ? "train" : summary.mode) as Mode,
      steps: summary.stepsCount,
      published: summary.timeframe,
      paperwork: plan.paperwork,
      transit: plan.route?.transit ?? null,
      doorToDoor: plan.doorToDoor,
      distanceKm: plan.route?.distanceKm ?? null,
      borders: plan.route?.borders ?? null,
    });
  }

  const given = givenSlots(next);
  const assumed: string[] = [];
  if (!given.has("quantity") && options.length) assumed.push("one load (a wagon, a truck or a pallet of air freight)");
  if (ends?.origin.assumed) assumed.push(`${ends.origin.place.name} as the starting point`);
  if (ends?.destination.assumed) assumed.push(`${ends.destination.place.name} as the destination`);
  return {
    goods: next.commodity.term,
    category: next.commodity.category,
    from: ends?.origin.place.name ?? facts.origin,
    to: ends?.destination.place.name ?? facts.destination,
    options,
    assumed,
    missing: CORE.filter((slot) => !given.has(slot)),
    unpublished,
  };
}

/* ---------------------------------------------------------- overview --- */

export type ShipmentNeeds = { documents: string[]; details: string[] };

export type Overview = {
  goods: string;
  category: string;
  options: EstimateOption[];
  /** The option the needs were read from. */
  focus: EstimateOption | null;
  needs: ShipmentNeeds | null;
};

/** What a procedure will ask the trader for, by name, before any case exists. */
export async function needsOf(procedureId: string, draft: IntakeDraft): Promise<ShipmentNeeds | null> {
  try {
    const procedure = await requireProcedure(procedureId);
    const plan = upfrontPlan(procedure, buildLedger([]), {
      goods: draft.commodity?.term ?? "",
      quantity: draft.quantity?.value ?? null,
      unit: draft.quantity?.unit ?? null,
      origin: draft.origin?.name ?? null,
      destination: draft.destination?.name ?? null,
      mode: draft.mode,
    });
    return {
      documents: plan.items.filter((i) => i.kind === "document").map((i) => i.label),
      // Plain values first: "contract number" is an example a trader recognises;
      // an application form's section heading ("General information") is not.
      details: [...plan.items.filter((i) => i.kind === "value").map((i) => i.label), ...plan.items.filter((i) => i.kind === "form").map((i) => i.label)],
    };
  } catch {
    return null;
  }
}

/** For someone finding out: every way the goods can go, how long each takes,
 *  and what the likeliest one will ask for. */
export async function overviewFor(draft: IntakeDraft, message = ""): Promise<Overview | null> {
  const estimate = await estimateFor(message, draft);
  if (!estimate || !estimate.options.length) return null;
  const focus = estimate.options[0];
  const needs = await needsOf(focus.procedureId, draftWith(draft, message));
  return { goods: estimate.goods, category: estimate.category, options: estimate.options, focus, needs };
}
