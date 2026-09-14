/* Conversational intake: what -> export/import -> how -> how much -> from/to -> confirm.
 *
 * Each turn folds the trader's reply into the draft, then walks the slots in
 * that fixed order and stops at the first one that is missing or invalid. A
 * slot is only valid when it fits what is published: a direction must exist
 * for the goods, a mode for the goods and direction, a quantity must be
 * sensible for the mode, and a route must cross the Uzbek border in that
 * direction to a country in the supplied fixture. Only when all five hold does
 * the turn become a confirm card - nothing is created here. */

import { PARTNER_COUNTRIES } from "../../data/countries";
import { PROCEDURES } from "../../data/procedures.generated";
import { countryName, fmtTonnes, toTonnes, unitsFor } from "../shipment-plan";
import { isEmptyDraft, mergeReply, type IntakeDraft, type Slot } from "./draft";
import { lookupProcedures, type Direction, type Mode } from "./lookup";
import { isTradeQuery } from "./relevance";
import { CATEGORIES } from "./taxonomy";
import { checkQuantity, checkRoute, modesFor, type RouteCheck } from "./validate";

export type TurnOption = { label: string; reply: string };
export type ProgressRow = { slot: Slot; label: string; value: string | null; done: boolean };

export type IntakeSummary = {
  what: string;
  how: string;
  howMuch: string;
  route: string;
  direction: Direction;
  procedureId: string;
  title: string;
  steps: number;
  blocks: number;
  /** One sentence the case is opened with. */
  query: string;
};

export type IntakeTurn = {
  status: "asking" | "confirm" | "declined";
  draft: IntakeDraft;
  /** The detail being asked for; the next reply is read against it. */
  slot?: Slot;
  message: string;
  options: TurnOption[];
  notes: string[];
  progress: ProgressRow[];
  summary?: IntakeSummary;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const UZ_CITIES = ["Tashkent", "Samarkand", "Andijan", "Bukhara"];
const DIRECTION_LABEL: Record<Direction, string> = { export: "Export from Uzbekistan", import: "Import into Uzbekistan" };

/** Destination requirements in the fixture that can apply to goods in scope. */
function requirementApplies(requirement: string, category: string): boolean {
  if (/animal products/i.test(requirement)) return false;
  if (/fresh produce/i.test(requirement)) return category === "fresh fruits and vegetables";
  return true;
}

function routeChips(route: RouteCheck, direction: Direction): TurnOption[] {
  const partners = (verb: "to" | "from") => PARTNER_COUNTRIES.map((c) => ({ label: c.name, reply: `${verb} ${c.name}` }));
  const cities = (verb: "to" | "from") => UZ_CITIES.map((c) => ({ label: c, reply: `${verb} ${c}` }));
  if (route.missing === "origin") return direction === "export" ? cities("from") : partners("from");
  if (route.missing === "destination") return direction === "export" ? partners("to") : cities("to");
  return [];
}

export function converse(draft: IntakeDraft, reply: string, options: { expecting?: Slot | null } = {}): IntakeTurn {
  const merged = mergeReply(draft, reply, options.expecting ?? null);

  if (isEmptyDraft(draft) && isEmptyDraft(merged.draft) && !merged.unsupportedGoods && !isTradeQuery(reply)) {
    return {
      status: "declined",
      draft: merged.draft,
      message: "That doesn't read as a shipment. Tell me what you're moving — for example “I want to move tea”.",
      options: [],
      notes: [],
      progress: [],
    };
  }

  const prefix: string[] = [];
  if (merged.unsupportedGoods) prefix.push(`No published procedure covers ${merged.unsupportedGoods}.`);
  if (merged.unknownPlace) prefix.push(`I don't know “${merged.unknownPlace}”.`);
  if (!merged.understood) prefix.push("I didn't catch that.");
  return evaluate(merged.draft, prefix);
}

export function evaluate(input: IntakeDraft, prefix: string[] = []): IntakeTurn {
  let draft = { ...input };
  const notes: string[] = [];
  let directionOk = false;
  let modeOk = false;
  let quantityOk = false;
  let routeOk = false;
  let direction: Direction | null = null;
  let tonnes: number | null = null;

  const progress = (): ProgressRow[] => [
    {
      slot: "commodity",
      label: "What",
      value: draft.commodity
        ? `${cap(draft.commodity.term)} · HS ${draft.commodity.hs}`
        : draft.pendingTerm
          ? `${cap(draft.pendingTerm)} — fresh or dried?`
          : null,
      done: Boolean(draft.commodity),
    },
    { slot: "direction", label: "Export / Import", value: direction ? cap(direction) : draft.statedDirection ? cap(draft.statedDirection) : null, done: directionOk },
    { slot: "mode", label: "How", value: draft.mode ? `By ${draft.mode}` : null, done: modeOk },
    {
      slot: "quantity",
      label: "How much",
      value: draft.quantity ? (tonnes != null ? fmtTonnes(tonnes) : `${draft.quantity.value} ${draft.quantity.unit}`) : null,
      done: quantityOk,
    },
    {
      slot: "route",
      label: "From → To",
      value: draft.origin || draft.destination ? `${draft.origin?.name ?? "?"} → ${draft.destination?.name ?? "?"}` : null,
      done: routeOk,
    },
  ];

  const ask = (slot: Slot, message: string, options: TurnOption[] = []): IntakeTurn => ({
    status: "asking",
    draft,
    slot,
    message: [...prefix, message].join(" "),
    options,
    notes,
    progress: progress(),
  });

  /* 1. What */
  if (!draft.commodity) {
    if (draft.pendingTerm) {
      const t = draft.pendingTerm;
      return ask("commodity", `Are the ${t} fresh or dried?`, [
        { label: `Fresh ${t}`, reply: `fresh ${t}` },
        { label: `Dried ${t}`, reply: `dried ${t}` },
      ]);
    }
    return ask(
      "commodity",
      "What goods are you moving? Published procedures cover tea, dried fruits, and fresh fruits and vegetables.",
      CATEGORIES.map((c) => ({ label: cap(c), reply: c })),
    );
  }
  const { category, term, hs } = draft.commodity;

  /* 2. Export or import - only directions a published procedure has */
  const all = modesFor(category, null);
  const published = (["export", "import"] as Direction[]).filter((d) => all.some((o) => o.directions.includes(d)));
  const route = checkRoute(draft.origin, draft.destination);

  if (route.level === "ok" && !published.includes(route.direction!)) {
    return ask(
      "route",
      `${cap(category)} can only be ${published.map((d) => (d === "export" ? "exported" : "imported")).join(" or ")} under a published procedure, but ${draft.origin!.name} → ${draft.destination!.name} is an ${route.direction}. Give a route that ${published[0] === "export" ? "leaves" : "enters"} Uzbekistan.`,
    );
  }
  if (route.level === "ok" && draft.statedDirection && route.direction !== draft.statedDirection) {
    return ask(
      "direction",
      `You chose ${draft.statedDirection}, but ${draft.origin!.name} → ${draft.destination!.name} is an ${route.direction}. Use ${route.direction}, or give a route that matches.`,
      [{ label: DIRECTION_LABEL[route.direction!], reply: route.direction! }],
    );
  }

  direction = draft.statedDirection ?? (route.level === "ok" ? route.direction : null);
  if (!direction) {
    if (published.length === 1) {
      direction = published[0];
      draft = { ...draft, statedDirection: direction };
      notes.push(`Only ${direction} is published for ${category} — ${direction}.`);
    } else {
      return ask("direction", `${cap(term)}: is it leaving Uzbekistan or coming in?`, published.map((d) => ({ label: DIRECTION_LABEL[d], reply: d })));
    }
  } else if (!published.includes(direction)) {
    return ask(
      "direction",
      `${cap(category)} is only published as ${published.join(" or ")}.`,
      published.map((d) => ({ label: DIRECTION_LABEL[d], reply: d })),
    );
  }
  directionOk = true;

  /* 3. How - only modes a published procedure has for the goods and direction */
  const available = modesFor(category, direction);
  if (!draft.mode) {
    if (available.length === 1) {
      draft = { ...draft, mode: available[0].mode };
      notes.push(`Only ${available[0].mode} is published for ${category} ${direction}s — by ${available[0].mode}.`);
    } else {
      return ask(
        "mode",
        `${cap(term)} (HS ${hs}), ${direction}. How will it travel?`,
        available.map((o) => ({ label: `By ${o.mode}`, reply: `by ${o.mode}` })),
      );
    }
  } else if (!available.some((o) => o.mode === draft.mode)) {
    const sameMode = all.find((o) => o.mode === draft.mode);
    const why = sameMode
      ? `By ${draft.mode}, ${category} is only published as ${sameMode.directions.join(" or ")}.`
      : `${cap(category)} by ${draft.mode} isn't a published procedure.`;
    const choice = available.length === 1 ? `It can go by ${available[0].mode}.` : "Pick a mode.";
    return ask("mode", `${why} ${choice}`, available.map((o) => ({ label: `By ${o.mode}`, reply: `by ${o.mode}` })));
  }
  modeOk = true;
  const mode = draft.mode as Mode;

  /* 4. How much - sensible for the mode */
  const examples = mode === "air" ? ["500 kg", "2 tonnes", "8 tonnes"] : ["20 tonnes", "1 wagon", "60 tonnes"];
  const exampleChips = examples.map((e) => ({ label: e, reply: e }));
  if (!draft.quantity) return ask("quantity", `How much ${term}? For example ${examples.join(", ")}.`, exampleChips);
  if (!(draft.quantity.value > 0)) return ask("quantity", "The quantity has to be more than zero. How much?", exampleChips);

  tonnes = toTonnes(draft.quantity.value, draft.quantity.unit, category);
  const q = checkQuantity(tonnes, mode, category);
  if (q.level === "reject") return ask("quantity", q.message, exampleChips);
  if (q.level === "warn" && !draft.quantity.acknowledged) {
    const choices: TurnOption[] = [{ label: `Keep ${fmtTonnes(tonnes!)} by ${mode}`, reply: "keep" }];
    if (q.suggest && available.some((o) => o.mode === q.suggest)) choices.push({ label: `Switch to ${q.suggest}`, reply: `by ${q.suggest}` });
    return ask("quantity", `${q.message} Keep it, or change the quantity${choices.length > 1 ? " or mode" : ""}?`, choices);
  }
  notes.push(q.message);
  quantityOk = true;

  /* 5. From -> To, in that direction */
  if (route.level !== "ok") return ask("route", route.message, routeChips(route, direction));
  routeOk = true;

  const o = draft.origin!;
  const d = draft.destination!;
  for (const end of [o, d]) {
    if (end.assumed) notes.push(`${countryName(end.country)} → ${end.name} assumed as the city; name a city to change it.`);
  }

  const partner = route.partner!;
  const facts = [
    partner.eaeu ? "EAEU member" : null,
    partner.originProof ? `origin proof ${partner.originProof}` : null,
    partner.crossingPoints.length
      ? `crossings ${partner.crossingPoints.join(", ")}`
      : partner.crossingNote
        ? partner.crossingNote.charAt(0).toLowerCase() + partner.crossingNote.slice(1)
        : null,
  ].filter(Boolean);
  if (facts.length) notes.push(`${partner.name}: ${facts.join(" · ")}.`);
  if (mode === "train" && /sea and air/i.test(partner.crossingNote ?? "")) {
    notes.push(`The country list gives ${partner.name} sea and air routes only — rail needs a sea leg.`);
  }
  const requirements = direction === "export" ? partner.destinationRequirements.filter((r) => requirementApplies(r, category)) : [];
  if (requirements.length) notes.push(`${partner.name} requires: ${requirements.join("; ")}.`);

  /* 6. Confirm */
  const ids = lookupProcedures(category, direction, mode);
  const p = PROCEDURES[ids[0]];
  const units = unitsFor(mode === "air" ? "air" : "train", category, tonnes);
  const summary: IntakeSummary = {
    what: `${cap(term)} (HS ${hs})`,
    how: `By ${mode}`,
    howMuch: `${fmtTonnes(tonnes!)} ≈ ${units.count} ${units.kind}${units.count > 1 ? "s" : ""}`,
    route: `${o.name}, ${countryName(o.country)} → ${d.name}, ${countryName(d.country)}`,
    direction,
    procedureId: p.id,
    title: p.title,
    steps: p.stepsCount,
    blocks: p.blocks.length,
    query: `${cap(direction)} ${fmtTonnes(tonnes!)} of ${term} from ${o.name} to ${d.name} by ${mode}`,
  };

  return {
    status: "confirm",
    draft,
    message: [...prefix, `Ready: ${p.title} (procedure ${p.id}), ${p.stepsCount} steps. Create the case and its steps?`].join(" "),
    options: [],
    notes,
    progress: progress(),
    summary,
  };
}
