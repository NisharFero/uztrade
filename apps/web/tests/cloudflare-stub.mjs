/* Stand-in for the `cloudflare:workers` built-in when the built worker is
 * imported by plain Node in tests.
 *
 * `env` is intentionally empty: no D1 binding. `getDb()` then throws its
 * documented error, which is correct for the routes under test (they render
 * static data). Database-backed routes are exercised against a running dev
 * server instead, where the real binding exists.
 */
export const env = {};
export default { env };
