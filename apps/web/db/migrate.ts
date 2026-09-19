/** Postgres migrations are applied outside request handling with Drizzle Kit.
 * This function remains as a compatibility hook for modules that previously
 * initialized local D1 on demand. */
export async function ensureSchema(): Promise<void> {}

