/* Route coverage.
 *
 * Master data knows a fixed set of places (the gazetteer) and a fixed set of
 * surface corridors out of Uzbekistan. A trader can always name something
 * outside both - "Tashkent to Frankfurt" - and that leg used to be dropped in
 * silence: the place did not resolve, the route was planned without it, and a
 * full step plan came back as though the shipment were routine. A plan built
 * on a route the data does not have is worse than no plan, so the case is
 * declined and the trader is told what is covered instead.
 *
 * Two gaps, reported the same way:
 *   1. the named place is not in the gazetteer ("Frankfurt");
 *   2. it is, but its country has no surface corridor ("Kyiv", "London") -
 *      only air is modelled to those.
 *
 * Vague wording is not a gap. "from the warehouse to the port" names no
 * particular place, so it is left to the usual flow, which assumes the Uzbek
 * end and asks for whatever else is missing.
 */

import type { ShipmentFacts } from "../workflow/domain";
import type { Mode } from "./lookup";
import { countryName, coveredCountryNames, findPlace, hasCorridor } from "./shipment-plan";

export type RouteEndName = "origin" | "destination";

export type RouteGap = {
  end: RouteEndName;
  /** What the trader called the place, as it should be quoted back. */
  named: string;
  reason: string;
  question: string;
  /** Countries master data can route to, for the trader to pick from. */
  suggestions: string[];
};

/** Generic nouns that stand in for a place without naming one. */
const VAGUE = /^(?:warehouse|port|harbour|harbor|factory|plant|depot|terminal|supplier|buyer|seller|customer|client|border|office|site|farm|market|shop|store|dock|yard|hub|home|there|here)s?$/i;
const ARTICLE = /^(?:the|a|an|our|my|your|their|his|her|its)\s+/i;
/** "to Almaty next month" - the trader's timing is not part of the place. */
const TIME_TAIL = /\s+(?:(?:next|this|last)\s+(?:week|month|year|quarter)|tomorrow|today|asap|soon|urgently)$/i;

/** The place name inside an extracted phrase, or null when the phrase names
 *  no particular place. Rules extraction keeps whatever followed "to", so
 *  "Frankfurt next month" has to come back as "Frankfurt". */
export function namedPlace(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.replace(TIME_TAIL, "").trim().replace(ARTICLE, "").trim();
  if (!trimmed) return null;
  // Traders capitalise the place and nothing else around it.
  const capitalised = trimmed.match(/\b[A-Z][\p{L}'’-]*(?:[ -][A-Z][\p{L}'’-]*)*/u)?.[0];
  const name = (capitalised ?? trimmed).trim();
  return !name || VAGUE.test(name) ? null : name;
}

const title = (s: string) => s.replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());

/** The first end of the route master data cannot plan, or null when it can
 *  plan both. `mode` gates the corridor check only: air needs no corridor,
 *  and an unknown mode is asked for by the usual clarify flow first. */
export function routeGap(facts: Pick<ShipmentFacts, "origin" | "destination">, mode: Mode | null): RouteGap | null {
  const surface = mode === "train" || mode === "road";
  const ends: RouteEndName[] = ["origin", "destination"];

  for (const end of ends) {
    const named = namedPlace(facts[end]);
    if (!named) continue;
    const place = findPlace(named);

    if (!place) {
      const covered = coveredCountryNames(surface);
      return {
        end,
        named,
        reason: `No route data for “${title(named)}”. Master data covers ${covered.length} countries${surface ? ` by ${mode}` : ""}; name a place in one of them.`,
        question: end === "destination" ? "Where is it going instead?" : "Where is it coming from instead?",
        suggestions: covered,
      };
    }

    if (surface && place.country !== "UZ" && !hasCorridor(place.country)) {
      const country = countryName(place.country);
      return {
        end,
        named: place.name,
        reason: `Master data has no ${mode} corridor to ${country}, so the transit countries and crossing times for ${place.name} are unknown. Only air is modelled there.`,
        question: `Where is it going instead, or should this go by air?`,
        suggestions: coveredCountryNames(true),
      };
    }
  }

  return null;
}

/** The trader's own sentence with the place they named swapped for a covered
 *  one, so picking a suggestion re-runs the query they actually wrote. */
export function withPlace(query: string, named: string, replacement: string): string {
  const at = query.toLowerCase().indexOf(named.toLowerCase());
  if (at < 0) return `${query.trim().replace(/[.!?]$/, "")} — to ${replacement}`;
  return query.slice(0, at) + replacement + query.slice(at + named.length);
}
