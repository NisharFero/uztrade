/* The procedure lookup: (commodity category, direction, mode, regime) ->
 * published procedure. The catalogue is the authority on which procedure
 * applies; a model may extract the slots but never overrides this. */

import { PROCEDURE_IDS, CATALOGUE, type ProcedureSummary } from "../procedures/data/procedures.generated";

export type Direction = "import" | "export";
export type Mode = "train" | "air" | "road";

/** What the goods are being put through, when more than one applies.
 *  "standard" is the whole export or import; "clearance" starts at the border. */
export type Regime = "standard" | "clearance" | "temporary" | "re-export";

export function lookupProcedures(category: string, direction: Direction | null, mode: Mode | null, regime: Regime | null = null): string[] {
  return PROCEDURE_IDS.filter((id) => {
    const p = CATALOGUE[id];
    return (
      p.goods === category &&
      (!direction || p.direction === direction) &&
      (!mode || p.mode === mode) &&
      (!regime || p.regime === regime)
    );
  });
}

/** A treatment named outright: "customs clearance only", "temporary import". */
const REGIME_WORDS: [RegExp, Regime][] = [
  [/\bre-?(export|import)\b/i, "re-export"],
  [/\btemporar(y|ily)\b/i, "temporary"],
  [
    /\b(customs )?clearance (only|alone)\b|\bonly (the )?(customs )?clearance\b|\bclear(ing)? (it |them )?(at|through) (the )?(border|customs)\b|\balready at the border\b/i,
    "clearance",
  ],
  [/\bwhole (export|import)\b|\bfull (export|import)\b|\bfrom the start\b/i, "standard"],
];

export const regimeIn = (text: string): Regime | null => REGIME_WORDS.find(([re]) => re.test(text))?.[1] ?? null;

/** The regimes published for these goods, in the order they are offered. */
export function regimesFor(category: string, direction: Direction, mode: Mode): Regime[] {
  const order: Regime[] = ["standard", "clearance", "temporary", "re-export"];
  const found = new Set(lookupProcedures(category, direction, mode).map((id) => CATALOGUE[id].regime as Regime));
  return order.filter((r) => found.has(r));
}

/** How a regime reads to a trader, in their direction. */
export function regimeLabel(regime: Regime, direction: Direction, basis?: string): string {
  const of = direction === "export" ? "export" : "import";
  const label =
    regime === "standard"
      ? `The whole ${of} — permits, contract, transport and clearance`
      : regime === "clearance"
        ? "Customs clearance only — the goods are already at the border"
        : regime === "temporary"
          ? direction === "import"
            ? "Temporary import — the goods leave again later"
            : "Temporary export — the goods come back later"
          : direction === "import"
            ? "Re-import — goods that were exported from Uzbekistan"
            : "Re-export — goods that were imported into Uzbekistan";
  return basis ? `${label} (on a ${basis} basis)` : label;
}

/** The corpus publishes the same facets twice in a few places (two clearances
 *  of dairy products by road, for instance). Pick deterministically, and pick
 *  the fuller document: more steps, then the lower id. */
export function pickProcedure(ids: string[]): ProcedureSummary | null {
  const rows = ids.map((id) => CATALOGUE[id]).filter(Boolean);
  if (!rows.length) return null;
  return [...rows].sort((a, b) => b.stepsCount - a.stepsCount || Number(a.id) - Number(b.id))[0];
}
