/* The intake draft: what the trader has told us so far, one slot per detail.
 *
 * The draft lives in the client between turns and is sent back with every
 * reply, so the server never trusts it: `parseDraft` rebuilds it from the
 * commodity table and the gazetteer, and the conversation re-validates the
 * whole thing on every turn. */

import { extractShipmentFacts } from "../workflow/domain";
import { findExactPlace, mentionedRoute, placesIn, type Place } from "./shipment-plan";
import { regimeIn, type Direction, type Mode, type Regime } from "./lookup";
import { CATEGORIES, commodityOf, logisticsDirection, type Category } from "./taxonomy";
import { CATALOGUE } from "../procedures/data/procedures.generated";
import { procedureReferenceIn } from "./reference";

export type Slot = "commodity" | "direction" | "mode" | "regime" | "quantity" | "route";

export type DraftEnd = { name: string; country: string; assumed: boolean };

export type IntakeDraft = {
  /** An explicit, catalogue-validated selection, retained across turns. */
  procedureId?: string | null;
  commodity: { term: string; category: Category; hs: string } | null;
  /** Goods named but ambiguous ("apricots") - kept so the question can name them. */
  pendingTerm: string | null;
  /** Goods outside the published categories, with the nearest one reasoned out
   *  and waiting for the trader's yes. Never applied on its own. */
  proposal: { term: string; category: Category; hs: string; reason: string } | null;
  mode: Mode | null;
  /** Which published treatment of the goods: the whole export/import, customs
   *  clearance only, temporary, or re-export. Asked only when several exist. */
  regime: Regime | null;
  quantity: { value: number; unit: string; acknowledged: boolean } | null;
  origin: DraftEnd | null;
  destination: DraftEnd | null;
  /** "export" / "import" in the trader's words; the route decides once both ends are known. */
  statedDirection: Direction | null;
};

export const EMPTY_DRAFT: IntakeDraft = {
  commodity: null,
  pendingTerm: null,
  proposal: null,
  mode: null,
  regime: null,
  quantity: null,
  origin: null,
  destination: null,
  statedDirection: null,
};


const MODE_WORDS: [RegExp, Mode][] = [
  [/\b(air|plane|flight|fly|airfreight)\b/i, "air"],
  [/\b(road|truck|lorry)\b/i, "road"],
  [/\b(rail|train|wagons?|railcar)\b/i, "train"],
];

const EXPORT_WORD = /\bexport(ing|s)?\b|\bout of uzbekistan\b|\bfrom uzbekistan\b/i;
const IMPORT_WORD = /\bimport(ing|s)?\b|\binto uzbekistan\b|\bto uzbekistan\b/i;

/* Country names as typed, to tell "Kazakhstan" (city assumed) from "Almaty". */
const COUNTRY_WORDS: Record<string, string[]> = {
  UZ: ["uzbekistan", "o'zbekiston"],
  KZ: ["kazakhstan"],
  KG: ["kyrgyzstan", "kirghizia"],
  TR: ["turkey", "turkiye", "türkiye"],
  AF: ["afghanistan"],
  RU: ["russia", "russian federation"],
  CN: ["china"],
};

function endOf(place: Place, text: string): DraftEnd {
  const t = text.toLowerCase();
  const namedCountry = (COUNTRY_WORDS[place.country] ?? []).some((w) => t.includes(w));
  const namedCity = t.includes(place.name.toLowerCase());
  return { name: place.name, country: place.country, assumed: namedCountry && !namedCity };
}

export type Merge = {
  draft: IntakeDraft;
  /** Something in the reply filled or changed a slot. */
  understood: boolean;
  unsupportedGoods: string | null;
  unknownPlace: string | null;
};

/** Folds one reply into the draft. Only slots the reply mentions change, so
 *  "20 tonnes from Tashkent to Almaty" fills two at once and "actually by air"
 *  corrects one. `expecting` lets a bare answer ("60", "Tashkent") land in
 *  the slot that was just asked about. */
export function mergeReply(draft: IntakeDraft, text: string, expecting: Slot | null = null): Merge {
  const standalone = commodityOf(text);
  const selected = procedureReferenceIn(text);
  const correction = /\b(actually|instead|change|correct|same shipment|same case)\b/i.test(text);
  const request = /\b(?:(?:i|we)\s*(?:want|need|plan|would like)\s*(?:to\s*)?)?(?:export|import|ship|send|move|transport)\b/i.test(text);
  const restart = /\b(start over|start again|new shipment|another shipment|different shipment|forget (?:that|this)|reset)\b/i.test(text);
  const namedGoods = standalone.kind !== "none";
  const fullRequest = /\b(?:i|we)\s*(?:want|need|plan|would like)\s*(?:to\s*)?(?:export|import|ship|send|move|transport)\b|^\s*(?:export|import|ship|send|move|transport)\s+\S/i.test(text);
  const changedGoods = standalone.kind === "known"
    ? Boolean(draft.commodity && (standalone.category !== draft.commodity.category || standalone.term !== draft.commodity.term))
    : standalone.kind !== "none" && Boolean(draft.commodity);
  // A fresh request replaces the shipment. Short answers and explicit
  // corrections keep context; changing goods clears all shipment facts.
  if (restart || changedGoods || ((fullRequest || (request && namedGoods)) && !correction)
    || (selected && selected.id !== draft.procedureId)) {
    draft = { ...EMPTY_DRAFT };
    expecting = null;
  }
  const next: IntakeDraft = { ...draft };
  let understood = false;
  let unsupportedGoods: string | null = null;
  let unknownPlace: string | null = null;
  const facts = extractShipmentFacts(text);
  const reference = procedureReferenceIn(text);
  if (reference) {
    const p = CATALOGUE[reference.id];
    next.procedureId = p.id;
    next.commodity = { term: p.goods, category: p.goods, hs: "" };
    next.mode = p.mode === "any" ? null : p.mode;
    next.statedDirection = p.direction === "transit" ? null : p.direction;
    next.regime = ["standard", "clearance", "temporary", "re-export"].includes(p.regime) ? p.regime as Regime : null;
    understood = true;
  }

  // What - a pending "apricots" is resolved by a reply of just "dried".
  const hit = reference ? { kind: "none" as const } : commodityOf(draft.pendingTerm ? `${text} ${draft.pendingTerm}` : text);
  if (hit.kind === "known") {
    next.commodity = { term: hit.term, category: hit.category, hs: hit.hs };
    next.pendingTerm = null;
    understood = true;
  } else if (hit.kind === "ambiguous") {
    next.pendingTerm = hit.term;
    next.commodity = null;
    understood = true;
  } else if (hit.kind === "unsupported") {
    unsupportedGoods = hit.term;
    understood = true;
  }

  // Which treatment: said outright ("customs clearance only", "temporary import").
  const regime = regimeIn(text);
  if (regime) {
    next.regime = regime;
    understood = true;
  }

  // How
  const mode = MODE_WORDS.find(([re]) => re.test(text))?.[1];
  if (mode) {
    if (mode !== draft.mode && next.quantity) next.quantity = { ...next.quantity, acknowledged: false };
    next.mode = mode;
    understood = true;
  }
  if (EXPORT_WORD.test(text) !== IMPORT_WORD.test(text)) {
    next.statedDirection = EXPORT_WORD.test(text) ? "export" : "import";
    understood = true;
  } else if (next.commodity?.category === "any cargo" && logisticsDirection(text)) {
    // Rail logistics: dispatching the cargo is 782, taking delivery of it 924.
    next.statedDirection = logisticsDirection(text);
    understood = true;
  }

  // How much
  const bare = expecting === "quantity" ? text.trim().match(/^(\d[\d,]*(?:\.\d+)?)$/) : null;
  if (facts.quantity != null) {
    next.quantity = { value: facts.quantity, unit: facts.unit ?? "t", acknowledged: false };
    understood = true;
  } else if (bare) {
    next.quantity = { value: Number(bare[1].replace(/,/g, "")), unit: "t", acknowledged: false };
    understood = true;
  }
  if (/^\s*keep\b/i.test(text) && next.quantity) {
    next.quantity = { ...next.quantity, acknowledged: true };
    understood = true;
  }

  // From -> To
  const places = placesIn(text);
  if (places.length) {
    understood = true;
    let { origin, destination } = mentionedRoute(facts, text);
    // Two places in one country ("Tashkent to Samarkand") - fall back to order.
    if (places.length >= 2) {
      origin ??= places.find((p) => p.place !== destination)?.place ?? null;
      destination ??= [...places].reverse().find((p) => p.place !== origin)?.place ?? null;
    }
    if (origin || destination) {
      if (origin) next.origin = endOf(origin, text);
      if (destination) next.destination = endOf(destination, text);
    } else {
      // One bare place answering the route question: it fills the missing end.
      const end = endOf(places[0].place, text);
      const importing = draft.statedDirection === "import";
      if (draft.origin?.assumed && draft.origin.country === end.country) next.origin = { ...end, assumed: false };
      else if (draft.destination?.assumed && draft.destination.country === end.country) next.destination = { ...end, assumed: false };
      else if (draft.destination && !draft.origin) next.origin = end;
      else if (draft.origin && !draft.destination) next.destination = end;
      else if ((end.country === "UZ") !== importing) next.origin = end;
      else next.destination = end;
    }
  } else if (expecting === "route" && /\b(from|to|into)\b/i.test(text)) {
    unknownPlace = (facts.destination ?? facts.origin ?? text.replace(/^.*\b(from|to|into)\s+/i, "")).trim();
    understood = true;
  } else if (expecting === "route" && !understood && (draft.origin?.assumed || draft.destination?.assumed) && /^[\p{L}][\p{L}\s'.-]{1,39}$/u.test(text.trim())) {
    // A bare name answering "which city in …?" that the gazetteer doesn't know: name it, keep the question.
    unknownPlace = text.trim();
    understood = true;
  }

  // Check each explicitly supplied endpoint, even when the other end is known.
  // Never let a known country hide an unknown city or reuse an old endpoint.
  const supplied: Partial<Record<"origin" | "destination", string>> = {};
  for (const match of text.matchAll(/\b(from|to|into)\s+(?!export\b|import\b|move\b|ship\b|send\b|bring\b|transport\b|arrange\b|start\b|take\b|get\b|deliver\b)(.+?)(?=\s+(?:from|to|into|by|via|with|using)\s|[;!?]|$)/gi)) {
    const name = match[2].trim().replace(/[.,]+$/, "");
    supplied[match[1].toLowerCase() === "from" ? "origin" : "destination"] = name;
  }
  const missing: string[] = [];
  for (const key of ["origin", "destination"] as const) {
    const name = supplied[key];
    if (!name) continue;
    const pieces = name.split(/\s*,\s*|\s+in\s+/i);
    const unknown = pieces.filter((piece) => !findExactPlace(piece));
    if (unknown.length) {
      missing.push(...unknown);
      next[key] = null;
    }
  }
  if (missing.length) {
    unknownPlace = [...new Set(missing)].join("”, “");
    understood = true;
  } else if (!Object.keys(supplied).length && expecting === "route" && !places.length && !understood && /^[\p{L}][\p{L}\s'.-]{1,59}$/u.test(text.trim())) {
    unknownPlace = text.trim();
    understood = true;
  }

  return { draft: next, understood, unsupportedGoods, unknownPlace };
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Rebuilds a draft sent back by the client, keeping only what still resolves. */
export function parseDraft(raw: unknown): IntakeDraft {
  if (!raw || typeof raw !== "object") return { ...EMPTY_DRAFT };
  const r = raw as Record<string, unknown>;
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

  const c = obj(r.commodity);
  const category = CATEGORIES.find((k) => k === c.category) ?? null;
  const end = (v: unknown): DraftEnd | null => {
    const e = obj(v);
    const name = str(e.name);
    const place = name ? placesIn(name)[0]?.place : null;
    return place ? { name: place.name, country: place.country, assumed: Boolean(e.assumed) } : null;
  };
  const q = obj(r.quantity);
  const value = typeof q.value === "number" ? q.value : Number.NaN;

  const pr = obj(r.proposal);
  const proposed = CATEGORIES.find((k) => k === pr.category) ?? null;
  const regimes: Regime[] = ["standard", "clearance", "temporary", "re-export"];

  return {
    ...(typeof r.procedureId === "string" && CATALOGUE[r.procedureId] ? { procedureId: r.procedureId } : {}),
    commodity: category ? { term: str(c.term) ?? category, category, hs: str(c.hs) ?? "" } : null,
    pendingTerm: str(r.pendingTerm),
    proposal:
      proposed && str(pr.term)
        ? { term: str(pr.term)!, category: proposed, hs: str(pr.hs) ?? "", reason: str(pr.reason) ?? "" }
        : null,
    mode: r.mode === "train" || r.mode === "air" || r.mode === "road" ? r.mode : null,
    regime: regimes.find((x) => x === r.regime) ?? null,
    quantity: Number.isFinite(value) ? { value, unit: str(q.unit) ?? "t", acknowledged: Boolean(q.acknowledged) } : null,
    origin: end(r.origin),
    destination: end(r.destination),
    statedDirection: r.statedDirection === "export" || r.statedDirection === "import" ? r.statedDirection : null,
  };
}

/** A draft with nothing in it - used for the relevance gate. */
export const isEmptyDraft = (d: IntakeDraft) =>
  !d.procedureId && !d.commodity && !d.pendingTerm && !d.proposal && !d.mode && !d.quantity && !d.origin && !d.destination && !d.statedDirection;

/* Re-exported for callers that only need the commodity table's categories. */
export { commodityOf };
