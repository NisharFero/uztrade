/* Synchronous access to the procedure workflows, for Node only: unit tests,
 * `scripts/` and anything else that runs outside the Worker.
 *
 * The application itself must use modules/procedures/registry.ts — a Worker has
 * no filesystem, and 3.4 MB of workflows is not something to hold in a request.
 * This module reads public/data/procedures/<id>.json on first touch and keeps
 * it, so a test can carry on writing PROCEDURES["868"].
 */

import { readFileSync } from "node:fs";
import { CATALOGUE, PROCEDURE_IDS, type Procedure } from "./data/procedures.generated";

export { CATALOGUE, PROCEDURE_IDS };
export type { Procedure };

const cache = new Map<string, Procedure>();

/** One procedure's workflow, read from disk on first use. */
export function procedureSync(id: string): Procedure | undefined {
  if (!CATALOGUE[id]) return undefined;
  const held = cache.get(id);
  if (held) return held;
  const url = new URL(`../../public/data/procedures/${id}.json`, import.meta.url);
  const procedure = JSON.parse(readFileSync(url, "utf8")) as Procedure;
  cache.set(id, procedure);
  return procedure;
}

/** Reads like the old generated map: PROCEDURES[id], `in`, Object.values(). */
export const PROCEDURES: Record<string, Procedure> = new Proxy({} as Record<string, Procedure>, {
  get: (_target, key: string | symbol) => (typeof key === "string" ? procedureSync(key) : undefined),
  has: (_target, key: string | symbol) => typeof key === "string" && Boolean(CATALOGUE[key]),
  ownKeys: () => Object.keys(CATALOGUE),
  getOwnPropertyDescriptor: (_target, key: string | symbol) =>
    typeof key === "string" && CATALOGUE[key]
      ? { enumerable: true, configurable: true, value: procedureSync(key) }
      : undefined,
});
