import { getDb } from "./index";

/* Applies drizzle/*.sql to the bound D1 database.
 *
 * On the hosting platform migrations are applied at deploy time, but local
 * miniflare D1 starts empty and this project has no wrangler.toml to point
 * `wrangler d1 execute` at (the binding config is inline in vite.config.ts).
 * Rather than keep a second hand-written copy of the DDL in sync, the
 * generated migration files are imported directly - one source of truth.
 *
 * Re-running is safe: "already exists" is swallowed, anything else rethrows.
 */

const migrations = import.meta.glob("../drizzle/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

let applied: Promise<void> | null = null;

async function apply(): Promise<void> {
  const db = getDb();

  // Filenames are zero-padded and ordered (0000_, 0001_, ...).
  for (const path of Object.keys(migrations).sort()) {
    const statements = migrations[path]
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      try {
        await db.run(statement as never);
      } catch (error) {
        // Drizzle wraps the driver error, so the useful text ("table X already
        // exists") is on the cause rather than the message.
        const message = [
          error instanceof Error ? error.message : String(error),
          error instanceof Error && error.cause instanceof Error ? error.cause.message : "",
        ].join(" ");
        if (/already exists|duplicate column/i.test(message)) continue;
        throw error;
      }
    }
  }
}

/** Idempotent per worker isolate; concurrent callers await the same promise. */
export function ensureSchema(): Promise<void> {
  applied ??= apply().catch((error) => {
    applied = null; // let a later request retry rather than caching the failure
    throw error;
  });
  return applied;
}
