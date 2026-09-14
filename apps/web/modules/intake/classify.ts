import { PROCEDURE_IDS, PROCEDURES } from "../procedures/data/procedures.generated";
import { extractShipmentFacts, type ShipmentFacts } from "../workflow/domain";
import { lookupProcedures, type Direction, type Mode } from "./lookup";
import { buildStepPlan, type StepPlan } from "./plan";
import { isTradeQuery } from "./relevance";
import { CATEGORIES, commodityOf, type Category, type CommodityHit } from "./taxonomy";
import { countryName, greatCircleKm, mentionedRoute, recommendMode, resolveRoute, toTonnes } from "./shipment-plan";

/* Intake agent.
 *
 * One free-text query resolves to exactly one procedure - with the step plan
 * to follow - or the trader is asked for the ONE missing dimension, or the
 * query is declined. It never guesses silently.
 *
 *   1. relevance gate   - small talk is declined before any lookup;
 *   2. slot extraction  - commodity, direction, mode, quantity, route (the
 *                         LLM when a key is set, rules otherwise);
 *   3. commodity table  - the term maps to a category (grapes -> fresh
 *                         produce, raisins -> dried fruit); "apricots" is
 *                         either, so it is asked;
 *   4. procedure lookup - (category, direction, mode) -> procedure id. The
 *                         table decides; a model's own pick never overrides it;
 *   5. clarification    - ask only the missing slot; after two follow-ups offer
 *                         the candidate procedures by title instead;
 *   6. step plan        - blocks, parallel tracks, lanes and per-step needs. */

export type Slot = "commodity" | "direction" | "mode";

export type Slots = {
  commodity: string | null;
  category: Category | null;
  hs: string | null;
  direction: Direction | null;
  mode: Mode | null;
  quantity: number | null;
  unit: string | null;
  origin: string | null;
  destination: string | null;
  originCountry: string | null;
  destinationCountry: string | null;
};

export type Clarification = { question: string; options: { label: string; query: string }[] };

export type Match = {
  status: "resolved" | "clarify" | "declined";
  procedureId: string | null;
  confidence: number;
  reason: string;
  matchedBy: "llm" | "rules";
  shipmentFacts: ShipmentFacts;
  slots: Slots;
  /** How the decision was reached, one line per stage. */
  rationale: string[];
  /** Set instead of a procedure when one answer from the trader would settle it. */
  clarify?: Clarification;
  missing?: Slot;
  candidates?: { id: string; title: string }[];
  plan?: StepPlan;
};

export type IntakeOptions = {
  /** Clarifying answers already given in this exchange. */
  followUps?: number;
};

const MAX_FOLLOW_UPS = 2;
const OUT_OF_SCOPE = "Out of scope. This workspace covers five procedures only.";

const CATALOGUE = PROCEDURE_IDS.map((id) => {
  const p = PROCEDURES[id];
  return `${id}: ${p.title} (${p.direction}, ${p.goods}, by ${p.mode})`;
}).join("\n");

/* ---------------------------------------------------------------- slots --- */

const STRONG_EXPORT = /\bexport(ing|s)?\b|\bout of uzbekistan\b|\bfrom uzbekistan\b/i;
const STRONG_IMPORT = /\bimport(ing|s)?\b|\binto uzbekistan\b|\bto uzbekistan\b/i;
const WEAK_EXPORT = /\bsell (it )?to\b|\bship out\b|\bsend\b/i;
const WEAK_IMPORT = /\bbuy from\b|\bbring in\b|\bpurchase from\b/i;

/** Direction from the words ("export", "into Uzbekistan") and, failing that,
 *  from the route: leaving Uzbekistan is an export, arriving an import. */
export function directionIn(query: string, facts: Pick<ShipmentFacts, "origin" | "destination">): Direction | null {
  const exportWord = STRONG_EXPORT.test(query);
  const importWord = STRONG_IMPORT.test(query);
  if (exportWord !== importWord) return exportWord ? "export" : "import";

  const { origin, destination } = mentionedRoute(facts, query);
  const home = (p: { country: string } | null) => (p ? p.country === "UZ" : null);
  if (origin && destination && home(origin) !== home(destination)) return home(origin) ? "export" : "import";
  if (destination && !origin && !home(destination)) return "export";
  if (origin && !destination && !home(origin)) return "import";

  if (WEAK_EXPORT.test(query) !== WEAK_IMPORT.test(query)) return WEAK_EXPORT.test(query) ? "export" : "import";
  return null;
}

export function modeIn(query: string): Mode | null {
  if (/\b(air|plane|flight|fly|airfreight|air cargo)\b/i.test(query)) return "air";
  if (/\b(road|truck|lorry|by car)\b/i.test(query)) return "road";
  if (/\b(rail|train|wagons?|railcar)\b/i.test(query)) return "train";
  return null;
}

/** The commodity category the query names, when the table knows it. */
export function goodsIn(query: string): Category | null {
  const hit = commodityOf(query);
  return hit.kind === "known" ? hit.category : null;
}

function commodityFor(query: string, facts: ShipmentFacts): CommodityHit {
  const fromQuery = commodityOf(query);
  return fromQuery.kind === "none" && facts.goods ? commodityOf(facts.goods) : fromQuery;
}

export function slotsOf(query: string, facts: ShipmentFacts, hit: CommodityHit = commodityFor(query, facts)): Slots {
  const { origin, destination } = mentionedRoute(facts, query);
  return {
    commodity: hit.kind === "none" ? facts.goods || null : hit.term,
    category: hit.kind === "known" ? hit.category : null,
    hs: hit.kind === "known" ? hit.hs : null,
    direction: directionIn(query, facts),
    mode: modeIn(query),
    quantity: facts.quantity,
    unit: facts.unit,
    origin: facts.origin,
    destination: facts.destination,
    originCountry: origin ? countryName(origin.country) : null,
    destinationCountry: destination ? countryName(destination.country) : null,
  };
}

/* ---------------------------------------------------------------- rules --- */

/** Deterministic path: the commodity table and the lookup, no model. Always
 *  available, so the app works with no API key and stays testable. */
export function classifyByRules(query: string): Match {
  const facts = extractShipmentFacts(query);
  const slots = slotsOf(query, facts);
  const ids = slots.category ? lookupProcedures(slots.category, slots.direction, slots.mode) : [];
  const procedureId = ids.length === 1 ? ids[0] : null;
  const p = procedureId ? PROCEDURES[procedureId] : null;
  return {
    status: p ? "resolved" : "declined",
    procedureId,
    confidence: p ? 0.9 : 0,
    reason: p ? `Matched on ${p.goods}, ${p.direction} by ${p.mode}.` : OUT_OF_SCOPE,
    matchedBy: "rules",
    shipmentFacts: facts,
    slots,
    rationale: [],
  };
}

/* ------------------------------------------------------------------ llm --- */

const SYSTEM = `You extract shipment details from Uzbek trade queries.

Supported procedures:
${CATALOGUE}

Understand what is being moved, how much, where it starts, where it ends, and the transport mode.
Reply with JSON only: {"procedureId": "<id>" | null, "confidence": 0-1, "reason": "<one sentence>", "shipment": {"goods": "<goods as the trader named them>", "quantity": <number|null>, "unit": "<unit|null>", "origin": "<place|null>", "destination": "<place|null>", "mode": "train|air|road|null"}}.
Keep "goods" in the trader's words (e.g. "raisins", "fresh tomatoes") - the application maps it to a category itself.
Use null for procedureId when the query does not clearly match one of the listed procedures -
different goods, a transport mode that is not listed, or a general question.
If the query names the goods and direction but NO transport mode, still return
a matching id: the application chooses train or air from the quantity and the
distance. Never guess an id that is not in the list.`;

type GroqChoice = { message?: { content?: string } };

/** Groq serves open-source models over an OpenAI-compatible endpoint. The
 *  model extracts slots; its procedure id is only a proposal. */
export async function classifyByLlm(query: string, apiKey: string): Promise<Match | null> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: query },
      ],
    }),
  });

  if (!response.ok) return null;

  const body = (await response.json()) as { choices?: GroqChoice[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) return null;

  let parsed: { procedureId?: unknown; confidence?: unknown; reason?: unknown; shipment?: unknown };
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  // Never trust the model's id: it must be one of the five we actually have.
  const id = typeof parsed.procedureId === "string" ? parsed.procedureId : null;
  const procedureId = id && (PROCEDURE_IDS as readonly string[]).includes(id) ? id : null;
  const fallback = extractShipmentFacts(query);
  const shipment = parsed.shipment && typeof parsed.shipment === "object" && !Array.isArray(parsed.shipment)
    ? parsed.shipment as Record<string, unknown>
    : {};
  const textFact = (key: string, fallbackValue: string | null) =>
    typeof shipment[key] === "string" && shipment[key].trim() ? shipment[key].trim() : fallbackValue;
  const quantity = typeof shipment.quantity === "number" && Number.isFinite(shipment.quantity) && shipment.quantity > 0
    ? shipment.quantity
    : fallback.quantity;
  const proposedMode = textFact("mode", fallback.mode)?.toLowerCase() ?? null;
  const mode = proposedMode === "rail" ? "train" : proposedMode === "truck" ? "road" : proposedMode;

  const shipmentFacts: ShipmentFacts = {
    goods: textFact("goods", fallback.goods) ?? "",
    quantity,
    unit: textFact("unit", fallback.unit),
    origin: textFact("origin", fallback.origin),
    destination: textFact("destination", fallback.destination),
    mode: mode && ["train", "air", "road"].includes(mode) ? mode : fallback.mode,
  };

  return {
    status: procedureId ? "resolved" : "declined",
    procedureId,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : procedureId ? 0.8 : 0,
    reason:
      typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim()
        : procedureId
          ? "Matched by classifier."
          : OUT_OF_SCOPE,
    matchedBy: "llm",
    shipmentFacts,
    slots: slotsOf(query, shipmentFacts),
    rationale: [],
  };
}

/* ---------------------------------------------------- settle or clarify --- */

const unique = <T,>(xs: T[]) => [...new Set(xs)];
const stem = (query: string) => query.trim().replace(/[.!?]$/, "");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Base = Omit<Match, "status" | "procedureId" | "confidence" | "reason">;

function declined(base: Base, reason: string): Match {
  return { ...base, status: "declined", procedureId: null, confidence: 0, reason, rationale: [...base.rationale, reason] };
}

/** Ask for the one missing slot - or, once the trader has already answered
 *  twice, stop asking and show the candidate procedures by title. */
function ask(base: Base, missing: Slot, clarify: Clarification, pool: string[], followUps: number): Match {
  if (followUps >= MAX_FOLLOW_UPS && pool.length) {
    const candidates = pool.slice(0, 3).map((id) => ({ id, title: PROCEDURES[id].title }));
    const question = "I still can't pin this down from the description — which of these procedures is it?";
    return {
      ...base,
      status: "clarify",
      procedureId: null,
      confidence: 0,
      reason: question,
      missing,
      candidates,
      clarify: {
        question,
        options: candidates.map((c) => {
          const p = PROCEDURES[c.id];
          return { label: c.title, query: `I want to ${p.direction} ${p.goods} by ${p.mode}` };
        }),
      },
    };
  }
  return { ...base, status: "clarify", procedureId: null, confidence: 0, reason: clarify.question, missing, clarify };
}

export function settleMatch(match: Match, query: string, options: IntakeOptions = {}): Match {
  const followUps = options.followUps ?? 0;
  const facts = match.shipmentFacts;
  const hit = commodityFor(query, facts);
  const slots = slotsOf(query, facts, hit);
  const rationale: string[] = [];
  const base: Base = {
    matchedBy: match.matchedBy,
    shipmentFacts: facts,
    slots,
    rationale,
  };

  // 1. Relevance gate.
  if (hit.kind === "none" && !match.procedureId && !isTradeQuery(query)) {
    return declined(base, "That doesn't read as a shipment. Tell me the goods, whether they leave or enter Uzbekistan, and how they travel.");
  }

  // 2-3. Commodity.
  if (hit.kind === "unsupported") {
    return declined(base, `No published procedure here covers ${hit.term}.`);
  }
  if (hit.kind === "ambiguous") {
    const pool = unique(hit.options.flatMap((c) => lookupProcedures(c, slots.direction, slots.mode)));
    return ask(base, "commodity", {
      question: `Are the ${hit.term} fresh or dried?`,
      options: [
        { label: `Fresh ${hit.term}`, query: `${stem(query)} (fresh ${hit.term})` },
        { label: `Dried ${hit.term}`, query: `${stem(query)} (dried ${hit.term})` },
      ],
    }, pool, followUps);
  }

  let category: string;
  if (hit.kind === "known") {
    category = hit.category;
    rationale.push(`"${hit.term}" is ${hit.category} in the commodity table (HS ${hit.hs}).`);
  } else if (match.procedureId) {
    // Genuinely novel wording: the only case where the model's reading is used.
    category = PROCEDURES[match.procedureId].goods;
    rationale.push(`"${facts.goods || "The goods"}" isn't in the commodity table; the classifier read it as ${category}.`);
  } else {
    return ask(base, "commodity", {
      question: "What goods are you moving?",
      options: CATEGORIES.map((c) => ({ label: cap(c), query: `${stem(query)} — ${c}` })),
    }, [...PROCEDURE_IDS], followUps);
  }

  // 4. Lookup.
  const family = PROCEDURE_IDS.filter((id) => PROCEDURES[id].goods === category);
  const fits = lookupProcedures(category, slots.direction, slots.mode);

  if (!fits.length) {
    const asked = [slots.direction, category, slots.mode ? `by ${slots.mode}` : ""].filter(Boolean).join(" ");
    const published = family.map((id) => PROCEDURES[id].title.toLowerCase()).join("; ");
    return declined(base, `There's no published procedure for ${asked} — only ${published}.`);
  }

  // 5. Clarify the missing dimension.
  const directions = unique(fits.map((id) => PROCEDURES[id].direction));
  if (directions.length > 1) {
    return ask(base, "direction", {
      question: `Is the ${category} leaving Uzbekistan or coming in?`,
      options: [
        { label: "Export from Uzbekistan", query: `${stem(query)} — export from Uzbekistan` },
        { label: "Import into Uzbekistan", query: `${stem(query)} — import into Uzbekistan` },
      ],
    }, fits, followUps);
  }

  let pick = fits[0];
  let reason = "";
  let confidence = slots.direction && slots.mode ? 0.95 : 0.85;

  const modes = unique(fits.map((id) => PROCEDURES[id].mode));
  if (modes.length > 1) {
    const tonnes = toTonnes(facts.quantity, facts.unit, category);
    if (tonnes == null) {
      return ask(base, "mode", {
        question: `By train or by air? Or tell me the quantity and I'll pick the mode that fits it.`,
        options: modes.map((m) => ({ label: m === "air" ? "By air" : m === "train" ? "By train" : `By ${m}`, query: `${stem(query)} by ${m}` })),
      }, fits, followUps);
    }
    const ends = resolveRoute(directions[0], facts, query);
    const km = ends.origin && ends.destination ? Math.round(greatCircleKm(ends.origin.place, ends.destination.place)) : null;
    const advice = recommendMode(category, tonnes, km);
    pick = fits.find((id) => PROCEDURES[id].mode === advice.mode) ?? fits[0];
    reason = `${PROCEDURES[pick].title}: no transport mode was stated, and ${advice.reason}.`;
    rationale.push(`No mode stated; the load decided: ${advice.reason}.`);
    confidence = 0.75;
  }

  const p = PROCEDURES[pick];
  if (!slots.direction) rationale.push(`Direction: ${p.direction} is the only one published for ${category}.`);
  else rationale.push(`Direction: ${slots.direction}.`);
  rationale.push(`Lookup (${category}, ${p.direction}, ${p.mode}) → procedure ${pick}.`);
  if (match.procedureId && match.procedureId !== pick) {
    rationale.push(`The classifier proposed ${match.procedureId}; the lookup table gives ${pick}, and the table decides.`);
  }
  if (hit.kind !== "known") confidence = Math.min(confidence, 0.7);

  const plan = buildStepPlan(p);
  return {
    ...base,
    status: "resolved",
    procedureId: pick,
    confidence,
    reason: reason || `Matched on ${p.goods}, ${p.direction} by ${p.mode}.`,
    shipmentFacts: { ...facts, mode: p.mode },
    slots: { ...slots, category: p.goods as Category, direction: p.direction, mode: p.mode },
    plan,
  };
}

/** LLM when a key is configured, deterministic rules otherwise or on failure;
 *  either way the proposal is settled against the commodity table. */
export async function classify(query: string, apiKey?: string, options: IntakeOptions = {}): Promise<Match> {
  if (apiKey) {
    try {
      const match = await classifyByLlm(query, apiKey);
      if (match) return settleMatch(match, query, options);
    } catch {
      // fall through to rules - a classifier outage must not break the app
    }
  }
  return settleMatch(classifyByRules(query), query, options);
}
