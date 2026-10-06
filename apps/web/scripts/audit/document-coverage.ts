/* Which inputs do the 243 procedures ask the trader for, and does Document
 * Intelligence know what each one is?
 *
 *   npx tsx scripts/audit/document-coverage.ts [--json out.json]
 *
 * Every step input the requirements parser classifies as a shipment input
 * ("case") gets a shape from inputShape() in modules/procedures/requirements.ts:
 * a document with a spec (fields read and verified), a value, an application
 * the platform drafts, a file kept as provided - or unclassified. Exits 1 when
 * anything is unclassified, so a new procedure cannot slip in unexamined.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Procedure } from "../../modules/procedures/data/procedures.generated";
import { allInputs, inputShape, procedureNeeds, type InputShape } from "../../modules/procedures/requirements";
import { DOC_SPECS } from "../../modules/documents/specs";

const dir = join(process.cwd(), "public/data/procedures");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

type Row = { label: string; docType: string | null; shape: InputShape; procedures: Set<string>; steps: number };
const rows = new Map<string, Row>();
let procedures = 0;
const failed: string[] = [];

for (const file of files) {
  try {
    const procedure = JSON.parse(readFileSync(join(dir, file), "utf8")) as Procedure;
    procedures += 1;
    for (const needs of procedureNeeds(procedure)) {
      for (const input of allInputs(needs)) {
        if (input.kind !== "case") continue;
        const label = input.label.trim();
        const key = label.toLowerCase();
        const row = rows.get(key) ?? { label, docType: input.docType, shape: inputShape(label), procedures: new Set(), steps: 0 };
        row.procedures.add(procedure.id);
        row.steps += 1;
        rows.set(key, row);
      }
    }
  } catch (error) {
    failed.push(`${file}: ${error instanceof Error ? error.message : error}`);
  }
}

const all = [...rows.values()].sort((a, b) => b.procedures.size - a.procedures.size);
const stepUses = (list: Row[]) => list.reduce((n, r) => n + r.steps, 0);
const total = stepUses(all);
const SHAPES: [InputShape, string][] = [
  ["document", "documents with a spec (fields read and verified)"],
  ["value", "single values typed once"],
  ["application", "applications the platform drafts"],
  ["kept", "files kept as provided (the entity examines them)"],
  ["unclassified", "UNCLASSIFIED"],
];

console.log(`Procedures read: ${procedures}/${files.length}${failed.length ? ` (failed: ${failed.length})` : ""}`);
console.log(`Distinct shipment inputs: ${all.length}, ${total} step uses. Document specs defined: ${Object.keys(DOC_SPECS).length}`);
for (const [shape, name] of SHAPES) {
  const list = all.filter((r) => r.shape === shape);
  const pct = total ? Math.round((stepUses(list) / total) * 100) : 0;
  console.log(`  ${String(list.length).padStart(4)} labels ${String(stepUses(list)).padStart(6)} uses ${String(pct).padStart(3)}%  ${name}`);
}
const unclassified = all.filter((r) => r.shape === "unclassified");
if (unclassified.length) {
  console.log("");
  console.log("Unclassified (decide: document spec, value, application or kept):");
  for (const r of unclassified) console.log(`  ${String(r.procedures.size).padStart(3)}  ${r.label}`);
}
if (failed.length) console.log(["", "Failed:", ...failed].join("\n"));
process.exitCode = unclassified.length || failed.length ? 1 : 0;

const out = process.argv.indexOf("--json");
if (out > 0)
  writeFileSync(
    process.argv[out + 1],
    JSON.stringify(
      all.map((r) => ({ label: r.label, shape: r.shape, docType: r.docType, procedures: r.procedures.size, steps: r.steps, ids: [...r.procedures].slice(0, 20) })),
      null,
      2,
    ),
  );
