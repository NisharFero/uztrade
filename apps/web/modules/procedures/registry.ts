/* Where a procedure's workflow comes from.
 *
 * The catalogue of all published procedures is bundled (title, goods, mode, kind,
 * counts) because listing, search and intake matching need every row. The
 * workflows are not: blocks, steps and step inputs come to 3.4 MB across the
 * corpus, so each one is a file under public/data/procedures/<id>.json, read
 * on demand and kept in memory afterwards.
 *
 * Three ways to read it, tried in order: the Worker's static assets binding
 * (when one is bound), the application's own origin (the Worker has no
 * filesystem - `public/` is reachable only over HTTP, and the request in hand
 * says which host to ask), and the filesystem (tests, scripts and
 * `node --test`). All three return the same object, so callers just await
 * getProcedure(id).
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

/* The origin that serves public/, remembered from a request. A streamed
 * response keeps working after its request scope has closed - where
 * next/headers no longer answers - and a procedure first needed mid-stream
 * would otherwise have nowhere to be fetched from. */
let knownOrigin: string | null = null;

/** Called by routes that stream, with the request's own URL. */
export function rememberOrigin(url: string): void {
  try {
    knownOrigin = new URL(url).origin;
  } catch {
    // not a URL; keep what we had
  }
}

async function fromKnownOrigin(id: string): Promise<Procedure | undefined> {
  if (!knownOrigin) return undefined;
  try {
    const response = await fetch(`${knownOrigin}/data/procedures/${id}.json`);
    return response.ok ? ((await response.json()) as Procedure) : undefined;
  } catch {
    return undefined;
  }
}

async function fromOrigin(id: string): Promise<Procedure | undefined> {
  try {
    // Only inside a request: the incoming headers name the host that serves
    // public/, and a Worker can only fetch an absolute URL.
    const { headers } = (await import("next/headers")) as typeof import("next/headers");
    const h = await headers();
    const host = h.get("host");
    if (!host) return undefined;
    const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
    const response = await fetch(`${proto}://${host}/data/procedures/${id}.json`);
    return response.ok ? ((await response.json()) as Procedure) : undefined;
  } catch {
    return undefined; // no request in hand, or nothing serving public/
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
    const procedure = (await fromAssets(id)) ?? (await fromOrigin(id)) ?? (await fromKnownOrigin(id)) ?? (await fromDisk(id));
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
