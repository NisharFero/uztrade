/* Bring Postgres master data back in line with the catalogue.
 *
 *   npm run db:sync
 *
 * Writes only what the seed owns: each entity's name and type, and each
 * published v1 procedure's title, definition and status. Cases, runs, users'
 * edits to entities and any later procedure versions are not touched. Run
 * `npm run eval -- --suite masterdata` afterwards to see it clean.
 */
import { existsSync, readFileSync } from "node:fs";

for (const file of ["../.env", ".env.local"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

const { syncMasterData } = await import("../../modules/catalog/bootstrap");
const { mockEntities, procedureSeeds } = await import("../../modules/catalog/seed");

await syncMasterData();
console.log(`Synced ${mockEntities().length} entities and ${procedureSeeds().length} procedure versions.`);
process.exit(0);
