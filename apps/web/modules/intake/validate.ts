/* Checks each intake detail against what is actually published: which modes
 * exist for the goods, whether a quantity is sensible for the mode, and
 * whether a route has one end in Uzbekistan and the other in the supplied
 * country fixture. Pure and deterministic - the conversation decides what to
 * ask; these decide what is valid. */

import { COUNTRIES, HOME_COUNTRY, PARTNER_COUNTRIES, type CountryProfile } from "./data/countries";
import { PROCEDURE_IDS, CATALOGUE } from "../procedures/data/procedures.generated";
import { countryName, fmtTonnes, unitsFor } from "./shipment-plan";
import type { DraftEnd } from "./draft";
import type { Direction, Mode } from "./lookup";

export type ModeOption = { mode: Mode; directions: Direction[]; procedureIds: string[] };

/** Modes a published procedure has for these goods - and direction, when known. */
export function modesFor(category: string, direction: Direction | null): ModeOption[] {
  const byMode = new Map<Mode, ModeOption>();
  for (const id of PROCEDURE_IDS) {
    const p = CATALOGUE[id];
    // Service procedures have no mode of their own, and transit is not something
    // intake opens a case for.
    if (p.mode === "any" || p.direction === "transit") continue;
    if (p.goods !== category || (direction && p.direction !== direction)) continue;
    const mode: Mode = p.mode;
    const dir: Direction = p.direction;
    const option = byMode.get(mode) ?? { mode, directions: [], procedureIds: [] };
    if (!option.directions.includes(dir)) option.directions.push(dir);
    option.procedureIds.push(id);
    byMode.set(mode, option);
  }
  return [...byMode.values()].sort((a, b) => (a.mode === "train" ? -1 : b.mode === "train" ? 1 : 0));
}

/* ------------------------------------------------------------ quantity --- */

export const QUANTITY_LIMITS = {
  /** One case; beyond this, split into several shipments. */
  railMaxT: 5000,
  airMaxT: 500,
  /** One wide-body freighter. */
  freighterT: 100,
  /** What scheduled passenger-aircraft holds realistically take. */
  bellyT: 10,
  /** Below this a wagon travels mostly empty. */
  railMinT: 1,
  /** About fifty trucks - a convoy, not one case. */
  roadMaxT: 1000,
  /** Beyond this, rail is the realistic mode where a rail procedure exists. */
  roadRailT: 200,
};

export type QuantityCheck = { level: "ok" | "warn" | "reject"; message: string; suggest: Mode | null };

export function checkQuantity(tonnes: number | null, mode: Mode, category: string): QuantityCheck {
  if (tonnes == null || !(tonnes > 0)) {
    return { level: "reject", message: "I couldn't read a quantity above zero — try “20 tonnes”, “500 kg” or “2 wagons”.", suggest: null };
  }
  const L = QUANTITY_LIMITS;
  const t = fmtTonnes(tonnes);
  const units = unitsFor(mode, category, tonnes);
  const approx = `${t} ≈ ${units.count} ${units.kind}${units.count > 1 ? "s" : ""}.`;

  if (mode === "air") {
    if (tonnes > L.airMaxT) {
      return { level: "reject", message: `${t} is beyond what one air shipment can realistically carry (over ${L.airMaxT} t). Split it, or send it by train.`, suggest: "train" };
    }
    if (tonnes > L.freighterT) {
      return { level: "warn", message: `${t} by air needs ${Math.ceil(tonnes / L.freighterT)} freighter flights — rail would cost far less.`, suggest: "train" };
    }
    if (tonnes > L.bellyT) {
      return { level: "warn", message: `${t} is more than passenger-aircraft holds take (~${L.bellyT} t) — it needs a freighter or charter.`, suggest: "train" };
    }
    return { level: "ok", message: approx, suggest: null };
  }

  if (mode === "road") {
    if (tonnes > L.roadMaxT) {
      return { level: "reject", message: `${t} is about ${units.count} trucks — more than one case should carry (limit ${L.roadMaxT.toLocaleString("en-US")} t). Split it into several shipments.`, suggest: "train" };
    }
    if (tonnes > L.roadRailT) {
      return { level: "warn", message: `${t} needs ${units.count} trucks — rail would carry it in far fewer units.`, suggest: "train" };
    }
    return { level: "ok", message: approx, suggest: null };
  }

  if (tonnes > L.railMaxT) {
    return { level: "reject", message: `${t} is about ${units.count} wagons — more than one case should carry (limit ${L.railMaxT.toLocaleString("en-US")} t). Split it into several shipments.`, suggest: null };
  }
  if (tonnes < L.railMinT) {
    return { level: "warn", message: `${t} fills only part of a ${units.kind} (~${units.perUnitT} t) — groupage, or air, may be cheaper.`, suggest: "air" };
  }
  return { level: "ok", message: approx, suggest: null };
}

/* --------------------------------------------------------------- route --- */

export type RouteCheck = {
  level: "ok" | "ask" | "reject";
  message: string;
  /** Known once one end places the shipment; final once both ends are valid. */
  direction: Direction | null;
  partner: CountryProfile | null;
  missing: "origin" | "destination" | "both" | null;
};

export const supportedCountries = () => PARTNER_COUNTRIES.map((c) => c.name).join(", ");

export function checkRoute(origin: DraftEnd | null, destination: DraftEnd | null): RouteCheck {
  const none = { direction: null, partner: null };

  for (const [end, which] of [
    [origin, "origin"],
    [destination, "destination"],
  ] as const) {
    if (end && !COUNTRIES[end.country]) {
      return {
        ...none,
        level: "reject",
        missing: which,
        message: `${end.name} (${countryName(end.country)}) isn't in the supported country list. The other end of a shipment can be ${supportedCountries()}.`,
      };
    }
  }

  if (!origin && !destination) {
    return { ...none, level: "ask", missing: "both", message: `From where to where? One end must be in Uzbekistan; the other in ${supportedCountries()}.` };
  }

  const home = (e: DraftEnd) => e.country === HOME_COUNTRY;

  if (origin && destination) {
    if (home(origin) && home(destination)) {
      return {
        ...none,
        level: "reject",
        missing: "both",
        message: `${origin.name} → ${destination.name} is domestic freight inside Uzbekistan — there's no export or import procedure for it. Give a route that crosses the border.`,
      };
    }
    if (!home(origin) && !home(destination)) {
      return {
        ...none,
        level: "reject",
        missing: "both",
        message: `Neither end of ${origin.name} → ${destination.name} is in Uzbekistan — third-country shipments aren't covered. One end must be in Uzbekistan.`,
      };
    }
    const exporting = home(origin);
    if (origin.assumed) {
      return {
        level: "ask",
        message: `Which city in ${countryName(origin.country)} is it from?`,
        direction: exporting ? "export" : "import",
        partner: COUNTRIES[exporting ? destination.country : origin.country],
        missing: "origin",
      };
    }
    if (destination.assumed) {
      return {
        level: "ask",
        message: `Which city in ${countryName(destination.country)} is it going to?`,
        direction: exporting ? "export" : "import",
        partner: COUNTRIES[exporting ? destination.country : origin.country],
        missing: "destination",
      };
    }
    return {
      level: "ok",
      message: `${origin.name} → ${destination.name}`,
      direction: exporting ? "export" : "import",
      partner: COUNTRIES[exporting ? destination.country : origin.country],
      missing: null,
    };
  }

  if (origin) {
    return home(origin)
      ? { level: "ask", direction: "export", partner: null, missing: "destination", message: `From ${origin.name} to where? Supported destinations: ${supportedCountries()}.` }
      : { level: "ask", direction: "import", partner: COUNTRIES[origin.country], missing: "destination", message: `From ${origin.name} (${COUNTRIES[origin.country].name}) to where in Uzbekistan?` };
  }

  const dest = destination!;
  return home(dest)
    ? { level: "ask", direction: "import", partner: null, missing: "origin", message: `To ${dest.name} from where? Supported origins: ${supportedCountries()}.` }
    : { level: "ask", direction: "export", partner: COUNTRIES[dest.country], missing: "origin", message: `To ${dest.name} (${COUNTRIES[dest.country].name}) from where in Uzbekistan?` };
}
