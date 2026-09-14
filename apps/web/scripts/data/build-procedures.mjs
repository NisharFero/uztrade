/* Generates modules/procedures/data/procedures.generated.ts from scripts/data/dag-data.json.
 *
 * The source JSON is the already-parsed form of the five Docs/Procedures/*.docx
 * files (blocks, dependency edges, duration ranges, per-step entity/channel).
 * Re-parsing the .docx files here would be redundant and slow - they are 2-7 MB
 * each and the structure has already been extracted.
 *
 * Run: node scripts/data/build-procedures.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("./dag-data.json", import.meta.url));
/* Section 5 "Inputs required per step" - see scripts/data/extract-inputs.mjs. */
const INPUTS = fileURLToPath(new URL("./inputs-data.json", import.meta.url));
const OUT = fileURLToPath(new URL("../../modules/procedures/data/procedures.generated.ts", import.meta.url));

/** Only these five are in scope. */
const IN_SCOPE = ["306", "325", "477", "540", "868"];

const raw = JSON.parse(readFileSync(SRC, "utf8"));
const rawInputs = JSON.parse(readFileSync(INPUTS, "utf8"));

/** "Export of dried fruits by train" -> direction / goods / mode, which the
 *  query classifier scores against. */
function parseTitle(title) {
  const m = title.match(/^(Export|Import|Clearance)\s+of\s+(.+?)\s+by\s+(train|air|road)$/i);
  if (!m) throw new Error(`Unparseable procedure title: ${title}`);
  return {
    direction: m[1].toLowerCase() === "clearance" ? "import" : m[1].toLowerCase(),
    goods: m[2].toLowerCase(),
    mode: m[3].toLowerCase(),
  };
}

/** "81–241" (en dash) -> [81, 241] hours. */
function parseTimeframe(tf) {
  const m = String(tf).match(/(\d+)\s*[–-]\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

const procedures = {};

for (const id of IN_SCOPE) {
  const p = raw[id];
  if (!p) throw new Error(`Procedure ${id} missing from source data`);

  const inputsByStep = new Map((rawInputs[id]?.steps ?? []).map((s) => [s.num, s.inputs]));
  const inputsOf = (num) => {
    const inputs = inputsByStep.get(num);
    if (!inputs) throw new Error(`Procedure ${id}: step ${num} has no section 5 inputs`);
    return inputs;
  };

  const blocks = p.blocks.map((b) => ({
    id: b.id,
    name: b.name,
    dependsOn: b.dependsOn ?? [],
    level: b.level ?? 0,
    // [min, max] hours for the whole block.
    estDuration: b.estDuration ?? [0, 0],
    dependencyReason: b.dependencyReason ?? "",
    lane: b.lane ?? "",
    entities: b.entities ?? [],
    stepRange: b.stepRange ?? [0, 0],
    optionalSteps: b.optionalSteps ?? [],
    altSteps: b.altSteps ?? [],
    steps: (b.steps ?? []).map((s) => ({
      num: s.num,
      title: s.title,
      output: s.output ?? "",
      entity: s.entity ?? "",
      channel: s.channel ?? "",
      where: s.where ?? "",
      performedBy: s.performedBy ?? "",
      optional: Boolean(s.optional),
      alternative: Boolean(s.alternative),
      inputs: inputsOf(s.num),
    })),
  }));

  // Integrity: every dependency must resolve to a sibling block.
  const ids = new Set(blocks.map((b) => b.id));
  for (const b of blocks)
    for (const d of b.dependsOn)
      if (!ids.has(d)) throw new Error(`Procedure ${id}: block ${b.id} depends on unknown ${d}`);

  procedures[id] = {
    id,
    title: p.title,
    ...parseTitle(p.title),
    timeframe: parseTimeframe(p.timeframe),
    stepsCount: p.stepsCount,
    blocks,
    entityDirectory: (p.entityDirectory ?? []).map((e) => ({
      name: e.name,
      steps: e.steps ?? "",
      lane: e.lane ?? "",
      contact: e.contact ?? "",
    })),
  };
}

const header = `/* GENERATED FILE - do not edit by hand.
 * Source: scripts/data/dag-data.json + scripts/data/inputs-data.json (parsed from Docs/Procedures/*.docx)
 * Regenerate: node scripts/data/build-procedures.mjs
 */

export type Channel =
  | "Online: apply"
  | "Online: obtain"
  | "Online: pay"
  | "Online: submit"
  | "In person";

export type ProcedureStep = {
  num: number;
  title: string;
  output: string;
  entity: string;
  channel: Channel | string;
  where: string;
  performedBy: string;
  optional: boolean;
  alternative: boolean;
  /** Section 5 "Inputs required per step", in published order. Headers such as
   *  "For physical payment" are kept; modules/procedures/requirements.ts interprets them. */
  inputs: string[];
};

export type ProcedureBlock = {
  id: string;
  name: string;
  dependsOn: string[];
  level: number;
  /** [min, max] hours for the whole block. */
  estDuration: [number, number];
  dependencyReason: string;
  lane: string;
  entities: string[];
  stepRange: [number, number];
  optionalSteps: number[];
  altSteps: number[];
  steps: ProcedureStep[];
};

export type EntityRef = {
  name: string;
  steps: string;
  lane: string;
  contact: string;
};

export type Procedure = {
  id: string;
  title: string;
  direction: "import" | "export";
  goods: string;
  mode: "train" | "air" | "road";
  /** [min, max] hours end to end, as published. */
  timeframe: [number, number];
  stepsCount: number;
  blocks: ProcedureBlock[];
  entityDirectory: EntityRef[];
};

/** The only procedures this application supports. */
export const PROCEDURE_IDS = ${JSON.stringify(IN_SCOPE)} as const;

export type ProcedureId = (typeof PROCEDURE_IDS)[number];

export const PROCEDURES: Record<string, Procedure> = `;

writeFileSync(OUT, header + JSON.stringify(procedures, null, 1) + ";\n", "utf8");

const totals = Object.values(procedures);
console.log(`Wrote ${OUT}`);
for (const p of totals) {
  console.log(
    `  ${p.id}  ${p.title.padEnd(46)} blocks=${String(p.blocks.length).padStart(2)} steps=${p.stepsCount} ` +
      `${p.direction}/${p.goods}/${p.mode} ${p.timeframe[0]}-${p.timeframe[1]}h`,
  );
}
