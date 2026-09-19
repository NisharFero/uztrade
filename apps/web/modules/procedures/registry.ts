/* Where a procedure's workflow comes from.
 *
 * The catalogue of all 243 procedures is bundled (title, goods, mode, kind,
 * counts) because listing, search and intake matching need every row. The
 * workflows are not: blocks, steps and step inputs come to 3.4 MB across the
 * corpus, so each one is a file under public/data/procedures/<id>.json, read
 * on demand and kept in memory afterwards.
 *
 * Two ways to read it, tried in order: the Worker's static assets binding, and
 * the filesystem (tests, scripts and `node --test`). Both return the same
 * object, so callers just await getProcedure(id).
 */

import { CATALOGUE, PROCEDURE_IDS, type Procedure, type ProcedureSummary } from "./data/procedures.generated";
import { getRuntimeEnv } from "../runtime/env";

export { CATALOGUE, PROCEDURE_IDS };
export type { Procedure, ProcedureSummary };

const cache = new Map<string, Procedure>();
const inFlight = new Map<string, Promise<Procedure | undefined>>();

/** Every procedure the application publishes, as summaries. */
export const catalogue = (): ProcedureSummary[] => Object.values(CATALOGUE);

export const procedureSummary = (id: string): ProcedureSummary | undefined => CATALOGUE[id];

export const isKnownProcedure = (id: string): boolean => Boolean(CATALOGUE[id]);

/** Already loaded in this isolate - for code that cannot await. */
export const loadedProcedure = (id: string): Procedure | undefined => cache.get(id);

async function fromAssets(id: string): Promise<Procedure | undefined> {
  try {
    const assets = getRuntimeEnv().ASSETS as { fetch: (request: Request) => Promise<Response> } | undefined;
    if (!assets?.fetch) return undefined;
    const response = await assets.fetch(new Request(`https://assets.local/data/procedures/${id}.json`));
    return response.ok ? ((await response.json()) as Procedure) : undefined;
  } catch {
    return undefined; // not running in a Worker
  }
}

async function fromDisk(id: string): Promise<Procedure | undefined> {
  try {
    // The specifier is built at runtime so the Worker bundler doesn't try to
    // resolve node:fs for an environment that never reaches this line.
    const fs = (await import(/* @vite-ignore */ `node:${"fs/promises"}`)) as typeof import("node:fs/promises");
    const path = (await import(/* @vite-ignore */ `node:${"path"}`)) as typeof import("node:path");
    const file = path.join(process.cwd(), "public", "data", "procedures", `${id}.json`);
    return JSON.parse(await fs.readFile(file, "utf8")) as Procedure;
  } catch {
    return undefined;
  }
}

/** One procedure's workflow: blocks, dependencies, steps and step inputs. */
export async function getProcedure(id: string): Promise<Procedure | undefined> {
  if (!id || !CATALOGUE[id]) return undefined;
  const held = cache.get(id);
  if (held) return held;
  const running = inFlight.get(id);
  if (running) return running;

  const load = (async () => {
    const procedure = (await fromAssets(id)) ?? (await fromDisk(id));
    if (procedure) cache.set(id, procedure);
    inFlight.delete(id);
    return procedure;
  })();
  inFlight.set(id, load);
  return load;
}

/** The workflow, or a clear error - for callers that cannot carry on without it. */
export async function requireProcedure(id: string): Promise<Procedure> {
  const procedure = await getProcedure(id);
  if (!procedure) throw new Error(`Procedure ${id} has no workflow file (public/data/procedures/${id}.json)`);
  return procedure;
}

/** Several at once, in the order asked. */
export async function getProcedures(ids: string[]): Promise<Procedure[]> {
  const loaded = await Promise.all(ids.map((id) => getProcedure(id)));
  return loaded.filter((p): p is Procedure => Boolean(p));
}
