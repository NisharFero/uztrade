/* One-off: can the web app actually reach the entity APIs it is configured for?
 *
 *   PORTALS_URL=https://<your-render-service> npx tsx scripts/debug/portals-reach-check.ts
 *
 * Checks the two things that break once the two services are on different
 * hosts: the base URL, and whether the key each entity expects matches the one
 * the client sends (unset keys fall back to the shared dev key on both sides).
 */
import { portalsFromEnv } from "../../modules/portals/client";

const client = portalsFromEnv(process.env as Record<string, string>);
if (!client) {
  console.error(
    "No portal client: PORTALS_DISABLED=1, or this is a production environment with no PORTALS_URL set (agent steps are simulated).",
  );
  process.exit(1);
}

console.log(`base: ${client.baseUrl}`);

const health = await fetch(`${client.baseUrl}/health`).catch((e: Error) => e);
if (health instanceof Error) {
  console.error(`unreachable: ${health.message}`);
  process.exit(1);
}
const body = (await health.json()) as { ok?: boolean; entities?: string[] };
console.log(`health: ${health.status} — ${body.entities?.length ?? 0} entities served`);

/* One authenticated read per entity: a 401 here means the keys differ between
   the two deployments, which is the failure that looks like "the agent just
   simulates everything". */
for (const entity of body.entities ?? []) {
  const key = (client.keys as Record<string, string>)[entity];
  const response = await fetch(`${client.baseUrl}/${entity}/v1/services`, { headers: key ? { "x-api-key": key } : {} });
  console.log(`  ${entity.padEnd(16)} ${response.status} ${response.ok ? "ok" : (await response.text()).slice(0, 80)}`);
}
