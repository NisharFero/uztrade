import { AsyncLocalStorage } from "node:async_hooks";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/* One schema, two ways to reach it.
 *
 * Production runs on Neon, whose serverless driver speaks HTTP: stateless, so
 * one instance can be kept for the life of the isolate. Local development runs
 * a plain Postgres on 127.0.0.1, which that driver cannot talk to at all - it
 * would post SQL to a Neon endpoint that isn't there - so the URL picks the
 * driver and every caller above this file gets the same drizzle instance
 * either way.
 *
 * The socket driver cannot be cached the same way. A Worker forbids using an
 * I/O object created by one request from another ("Cannot perform I/O on
 * behalf of a different request"), and a TCP connection is exactly that. So
 * `withDbScope` holds one connection per request, and anything outside a
 * request - tests, scripts, `next build` - falls back to a single lazy one.
 */

type Db = ReturnType<typeof drizzleNeon<typeof schema>>;

/** Neon's own hosts; anything else is a Postgres we open a socket to. */
const isNeon = (url: string) => /neon\.tech|neon\.build/i.test(url);

function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required for UzTrade's Postgres database. Set it in Vercel, in apps/.env for local development (`npm run db:setup` writes one), or in apps/web/.env.local for local production-mode testing.",
    );
  }

  if (isNeon(url)) return drizzleNeon(neon(url), { schema });
  // One connection, dropped by the server once it goes quiet: a Worker isolate
  // is short-lived and a local cluster has no reason to hold a pool open.
  return drizzlePostgres(postgres(url, { max: 1, prepare: false, idle_timeout: 20 }), {
    schema,
  }) as unknown as Db;
}

const perRequest = new AsyncLocalStorage<{ db?: Db }>();
let shared: Db | null = null;

/** Run one request with a connection of its own. The Worker entry wraps every
 *  request in this; without it a cached socket would outlive its request. */
export function withDbScope<T>(run: () => T): T {
  return perRequest.run({}, run);
}

export function getDb(): Db {
  const scope = perRequest.getStore();
  if (scope) return (scope.db ??= createDb());
  return (shared ??= createDb());
}
