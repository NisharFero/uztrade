/* Walks every published procedure end to end; see walk.ts.
 *
 *   npx tsx scripts/audit/walk-procedures.ts [id ...] [--json out.json]
 */

import { writeFileSync } from "node:fs";
import { CATALOGUE, PROCEDURE_IDS } from "../../modules/procedures/sync";
import { walk, type Outcome } from "./walk";

const args = process.argv.slice(2);
const jsonAt = args.indexOf("--json");
const jsonPath = jsonAt >= 0 ? args[jsonAt + 1] : null;
const ids = args.filter((a, i) => !a.startsWith("--") && (jsonAt < 0 || i !== jsonAt + 1));
const targets = (ids.length ? ids : PROCEDURE_IDS).filter((id) => CATALOGUE[id]);

const outcomes: Outcome[] = [];
for (const id of targets) {
  const outcome = await walk(id);
  outcomes.push(outcome);
  if (outcome.status !== "completed") console.log(`${outcome.status.toUpperCase()} ${id} at step ${outcome.at ?? "?"}: ${outcome.reason}`);
}
const count = (s: Outcome["status"]) => outcomes.filter((o) => o.status === s).length;
console.log(`\n${targets.length} procedures: ${count("completed")} completed, ${count("stuck")} stuck, ${count("crashed")} crashed`);
console.log(`Slowest: ${[...outcomes].sort((a, b) => b.ms - a.ms).slice(0, 3).map((o) => `${o.id} ${Math.round(o.ms / 1000)}s`).join(", ")}`);
if (jsonPath) writeFileSync(jsonPath, JSON.stringify(outcomes, null, 2));
process.exitCode = count("completed") === targets.length ? 0 : 1;
