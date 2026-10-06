/* The document requirements of all 243 procedures, in one file.
 *
 *   npx tsx scripts/audit/requirements-map.ts
 *
 * Writes public/data/document-requirements.json: for each procedure, every
 * shipment input it asks for - what it is (inputShape), at which steps, and
 * for a document the fields Document Intelligence reads from it - plus the
 * field list of every document spec once. The app computes the same thing at
 * run time from modules/procedures/requirements.ts; this is the reference a
 * person (or a test) can read without running it.
 */

import { writeFileSync } from "node:fs";
import { DOC_SPECS } from "../../modules/documents/specs";
import { allInputs, inputShape, procedureNeeds, type InputKind, type InputShape } from "../../modules/procedures/requirements";
import { CATALOGUE, PROCEDURE_IDS, PROCEDURES } from "../../modules/procedures/sync";

type Entry = { label: string; kind: InputKind; shape: InputShape | "profile" | "identity"; docType: string | null; steps: number[]; optional: boolean };

const procedures: Record<string, { title: string; steps: number; inputs: Entry[] }> = {};
for (const id of PROCEDURE_IDS) {
  const byLabel = new Map<string, Entry>();
  for (const needs of procedureNeeds(PROCEDURES[id])) {
    for (const input of allInputs(needs)) {
      // Presence, published material and earlier outputs are not the trader's to provide.
      if (input.kind !== "case" && input.kind !== "profile" && input.kind !== "identity") continue;
      const entry = byLabel.get(input.label) ?? {
        label: input.label,
        kind: input.kind,
        shape: input.kind === "case" ? inputShape(input.label) : input.kind,
        docType: input.docType,
        steps: [],
        optional: input.optional,
      };
      if (!entry.steps.includes(needs.stepNum)) entry.steps.push(needs.stepNum);
      entry.optional &&= input.optional;
      byLabel.set(input.label, entry);
    }
  }
  procedures[id] = { title: CATALOGUE[id].title, steps: CATALOGUE[id].stepsCount, inputs: [...byLabel.values()] };
}

const specs = Object.fromEntries(
  Object.values(DOC_SPECS).map((s) => [
    s.type,
    { name: s.name, specimen: s.specimen, fields: s.fields.map((f) => ({ key: f.key, name: f.name, kind: f.kind, required: f.required, source: f.source })), checks: s.checks },
  ]),
);

const out = "public/data/document-requirements.json";
writeFileSync(out, JSON.stringify({ generatedBy: "scripts/audit/requirements-map.ts", procedures: Object.keys(procedures).length, specs, byProcedure: procedures }) + "\n");

const docs = Object.values(procedures).flatMap((p) => p.inputs.filter((i) => i.docType));
console.log(`${out}: ${Object.keys(procedures).length} procedures, ${Object.keys(specs).length} document specs, ${docs.length} procedure-document pairs with fields`);
