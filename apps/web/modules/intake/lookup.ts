/* The procedure lookup table: (commodity category, direction, mode) ->
 * published procedure. The table is the authority on which procedure
 * applies; a model may extract the slots but never overrides this. */

import { PROCEDURE_IDS, CATALOGUE } from "../procedures/data/procedures.generated";

export type Direction = "import" | "export";
export type Mode = "train" | "air" | "road";

export function lookupProcedures(category: string, direction: Direction | null, mode: Mode | null): string[] {
  return PROCEDURE_IDS.filter((id) => {
    const p = CATALOGUE[id];
    return p.goods === category && (!direction || p.direction === direction) && (!mode || p.mode === mode);
  });
}
