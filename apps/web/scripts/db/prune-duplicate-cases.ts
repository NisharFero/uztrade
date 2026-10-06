/* Remove duplicate demo cases: the same procedure opened for the same request
 * more than once, usually while testing.
 *
 *   npm run db:prune-duplicates            list what would go (nothing is changed)
 *   npm run db:prune-duplicates -- --apply delete it
 *
 * Keeps the oldest case of each (procedure, request) pair and deletes the
 * others with everything they own - workflow run, nodes, edges, work items,
 * agent runs, artifacts, audit events, block rows - in one transaction.
 * Master data (procedures, entities, users) is never touched.
 */
import { existsSync, readFileSync } from "node:fs";
import postgres from "postgres";

for (const file of ["../.env", ".env.local"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

const apply = process.argv.includes("--apply");
/** `--through UZ-2609-0020`: only cases up to this reference are candidates -
 *  newer ones may be in use by whoever just opened them. */
const throughAt = process.argv.indexOf("--through");
const through = throughAt >= 0 ? process.argv[throughAt + 1]?.toUpperCase() : null;
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { max: 1 });

type Row = { id: string; procedure_id: string; query: string; title: string; created_at: Date; workflow_run_id: string | null };
const rows = await sql<Row[]>`select id, procedure_id, query, title, created_at, workflow_run_id from cases order by created_at, id`;

/** `--ids UZ-2609-0028,UZ-2609-0029`: remove exactly these (test cases), duplicates or not. */
const idsAt = process.argv.indexOf("--ids");
const only = idsAt >= 0 ? new Set((process.argv[idsAt + 1] ?? "").toUpperCase().split(",").filter(Boolean)) : null;

const kept = new Map<string, Row>();
const doomed: Row[] = [];
for (const row of rows) {
  const key = `${row.procedure_id}|${row.query.trim().toLowerCase()}`;
  if (only) {
    if (only.has(row.id)) doomed.push(row);
    else if (!kept.has(key)) kept.set(key, row);
    continue;
  }
  if (!kept.has(key)) kept.set(key, row);
  else if (!through || row.id <= through) doomed.push(row);
}

console.log(`${rows.length} cases, ${kept.size} distinct shipments.`);
for (const row of kept.values()) console.log(`  keep    ${row.id}  ${row.title} — ${row.query}`);
for (const row of doomed) {
  const twin = kept.get(`${row.procedure_id}|${row.query.trim().toLowerCase()}`);
  console.log(`  ${apply ? "delete" : "would delete"}  ${row.id}  ${twin && twin.id !== row.id ? `(same as ${twin.id})` : row.query}`);
}

if (!doomed.length) {
  console.log("Nothing to remove.");
} else if (!apply) {
  console.log("\nDry run. Pass --apply to delete.");
} else {
  const ids = doomed.map((r) => r.id);
  const runs = doomed.map((r) => r.workflow_run_id).filter((r): r is string => Boolean(r));
  await sql.begin(async (tx) => {
    if (runs.length) {
      await tx`delete from agent_runs where run_id in ${tx(runs)}`;
      await tx`delete from artifacts where run_id in ${tx(runs)}`;
      await tx`delete from audit_events where run_id in ${tx(runs)}`;
      await tx`delete from work_items where run_id in ${tx(runs)}`;
      await tx`delete from workflow_edges where run_id in ${tx(runs)}`;
      await tx`delete from workflow_nodes where run_id in ${tx(runs)}`;
      await tx`delete from workflow_runs where id in ${tx(runs)}`;
    }
    await tx`delete from case_blocks where case_id in ${tx(ids)}`;
    await tx`delete from cases where id in ${tx(ids)}`;
  });
  console.log(`\nDeleted ${ids.length} duplicate cases and their workflow data.`);
}
await sql.end();
