/* Generates the procedure catalogue and the per-procedure workflow files from
 * scripts/data/procedures/*.json (written by scripts/data/extract-all.mjs).
 *
 * All 243 published procedures are in scope. Their full workflows are 3.6 MB of
 * JSON — too much to import into the Worker bundle — so this writes two things:
 *
 *   modules/procedures/data/procedures.generated.ts
 *       the types, the id list and one summary row per procedure (title,
 *       direction, goods, mode, kind, timeframe, counts). Small enough to
 *       bundle, and all the catalogue, search and intake matching need.
 *
 *   public/data/procedures/<id>.json
 *       the workflow itself: blocks, dependencies, steps and their inputs.
 *       Loaded on demand by modules/procedures/registry.ts and cached.
 *
 * Run: node scripts/data/extract-all.mjs && node scripts/data/build-procedures.mjs
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("./procedures/", import.meta.url));
/* The ten procedures extracted and checked by hand keep their published block
 * dependencies and durations; the rest are derived by extract-all.mjs. */
const CURATED = fileURLToPath(new URL("./dag-data.json", import.meta.url));
const CURATED_INPUTS = fileURLToPath(new URL("./inputs-data.json", import.meta.url));
const OUT_TS = fileURLToPath(new URL("../../modules/procedures/data/procedures.generated.ts", import.meta.url));
const OUT_JSON = fileURLToPath(new URL("../../public/data/procedures/", import.meta.url));

/** Titles that don't say direction, goods and mode plainly. 161 is an export:
 *  its steps file an export declaration and leave through a border post. 782
 *  and 924 are rail logistics for any cargo — dispatching it, and taking
 *  delivery of it — rather than customs procedures for particular goods. */
const OVERRIDES = {
  161: { direction: "export", goods: "fruit and vegetable juices", mode: "road", kind: "customs" },
  782: { direction: "export", goods: "any cargo", mode: "train", kind: "logistics" },
  924: { direction: "import", goods: "any cargo", mode: "train", kind: "logistics" },
};

/** What a procedure is about, from its published title.
 *
 *   customs    clearing named goods across the border, by a named mode
 *   logistics  arranging or taking delivery of any cargo, transit
 *   service    obtaining one document or registering one contract — no goods
 *              and no mode of its own, so mode is "any"
 */
function parseTitle(id, title) {
  if (OVERRIDES[id]) return OVERRIDES[id];
  const t = title.trim();

  const customs = t.match(/^(Export|Import|Clearance|Re-?export|Re-?import|Temporary import|Temporary export)\s+of\s+(.+?)\s+by\s+(train|air|road)$/i);
  if (customs) {
    const verb = customs[1].toLowerCase();
    return {
      direction: /export/.test(verb) ? "export" : "import",
      goods: customs[2].toLowerCase().replace(/\s+/g, " ").trim(),
      mode: customs[3].toLowerCase(),
      kind: "customs",
    };
  }

  const transit = t.match(/^Transit\s+by\s+(train|air|road)/i);
  if (transit) return { direction: "transit", goods: "any cargo", mode: transit[1].toLowerCase(), kind: "logistics" };

  const arrange = t.match(/^Arrange\s+cargo\s+(delivery|transportation)\s+by\s+(train|air|road)/i);
  if (arrange) {
    return {
      direction: arrange[1].toLowerCase() === "delivery" ? "import" : "export",
      goods: "any cargo",
      mode: arrange[2].toLowerCase(),
      kind: "logistics",
    };
  }

  // Everything else is a service: "Obtain veterinary permit", "Registration of
  // export contract", "Contract customs warehouse".
  const mode = t.match(/\bby\s+(train|air|road)\b/i);
  return {
    direction: /\bexport/i.test(t) ? "export" : /\bimport/i.test(t) ? "import" : "export",
    goods: "any cargo",
    mode: mode ? mode[1].toLowerCase() : "any",
    kind: "service",
  };
}

/** "81–241" (en dash) -> [81, 241] hours. */
function parseTimeframe(tf) {
  const m = String(tf).match(/(\d+)\s*[–-]\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

const curated = JSON.parse(readFileSync(CURATED, "utf8"));
const curatedInputs = JSON.parse(readFileSync(CURATED_INPUTS, "utf8"));

const files = readdirSync(SRC).filter((f) => f.endsWith(".json"));
if (!files.length) throw new Error(`No parsed procedures in ${SRC} — run scripts/data/extract-all.mjs first`);

const summaries = [];
let missingInputs = 0;

rmSync(OUT_JSON, { recursive: true, force: true });
mkdirSync(OUT_JSON, { recursive: true });

for (const file of files.sort((a, b) => Number(a.replace(".json", "")) - Number(b.replace(".json", "")))) {
  const parsed = JSON.parse(readFileSync(SRC + file, "utf8"));
  const id = parsed.id;
  // A curated procedure keeps its hand-checked graph; its step inputs come
  // from the same section 5 extraction as everything else.
  const hand = curated[id];
  const p = hand
    ? {
        ...hand,
        id,
        stepInputs:
          parsed.stepInputs ??
          Object.fromEntries((curatedInputs[id]?.steps ?? []).map((s) => [s.num, s.inputs])),
      }
    : parsed;
  const facts = parseTitle(id, p.title);

  const blocks = p.blocks.map((b) => ({
    id: b.id,
    name: b.name,
    dependsOn: b.dependsOn ?? [],
    level: b.level ?? 0,
    estDuration: b.estDuration ?? [0, 0],
    dependencyReason: b.dependencyReason ?? "",
    lane: b.lane ?? "",
    entities: b.entities ?? [],
    stepRange: b.stepRange ?? [0, 0],
    optionalSteps: b.optionalSteps ?? [],
    altSteps: b.altSteps ?? [],
    steps: (b.steps ?? []).map((s) => {
      const inputs = p.stepInputs?.[s.num] ?? [];
      if (!inputs.length) missingInputs += 1;
      return {
        num: s.num,
        title: s.title,
        output: s.output ?? "",
        entity: s.entity ?? "",
        channel: s.channel ?? "",
        where: s.where ?? "",
        performedBy: s.performedBy ?? "",
        optional: Boolean(s.optional),
        alternative: Boolean(s.alternative),
        inputs,
      };
    }),
  }));

  // Integrity: every dependency must resolve to a sibling block.
  const ids = new Set(blocks.map((b) => b.id));
  for (const b of blocks) {
    for (const d of b.dependsOn) {
      if (!ids.has(d)) throw new Error(`Procedure ${id}: block ${b.id} depends on unknown ${d}`);
    }
  }

  const procedure = {
    id,
    title: p.title,
    ...facts,
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

  writeFileSync(`${OUT_JSON}${id}.json`, JSON.stringify(procedure));

  summaries.push({
    id,
    title: p.title,
    ...facts,
    timeframe: procedure.timeframe,
    blocksCount: blocks.length,
    stepsCount: p.stepsCount,
    onlineCount: blocks.reduce((n, b) => n + b.steps.filter((s) => /^online/i.test(s.channel)).length, 0),
    entities: [...new Set(blocks.flatMap((b) => b.entities))].filter(Boolean),
  });
}

const byId = Object.fromEntries(summaries.map((s) => [s.id, s]));
const ids = summaries.map((s) => s.id);

const header = `/* GENERATED FILE - do not edit by hand.
 * Source: Docs/Procedures/*.docx -> scripts/data/extract-all.mjs -> scripts/data/procedures/*.json
 * Regenerate: node scripts/data/extract-all.mjs && node scripts/data/build-procedures.mjs
 *
 * This module holds the types and the catalogue of all ${ids.length} published
 * procedures. A procedure's workflow - its blocks, steps and step inputs - is
 * 3.6 MB across the corpus, so it is served from public/data/procedures/<id>.json
 * and loaded on demand by modules/procedures/registry.ts.
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

export type Direction = "import" | "export" | "transit";

/** "any" is a service procedure: obtaining one document or registering one
 *  contract, which no single transport mode belongs to. */
export type TransportMode = "train" | "air" | "road" | "any";

/** "customs": clearing named goods across the border. "logistics": arranging
 *  or taking delivery of any cargo, and transit. "service": obtaining one
 *  document or registering one contract. */
export type ProcedureKind = "customs" | "logistics" | "service";

/** What the catalogue knows about every procedure without loading its workflow. */
export type ProcedureSummary = {
  id: string;
  title: string;
  direction: Direction;
  goods: string;
  mode: TransportMode;
  kind: ProcedureKind;
  /** [min, max] hours end to end, as published. */
  timeframe: [number, number];
  blocksCount: number;
  stepsCount: number;
  onlineCount: number;
  entities: string[];
};

export type Procedure = {
  id: string;
  title: string;
  direction: Direction;
  goods: string;
  mode: TransportMode;
  kind: ProcedureKind;
  timeframe: [number, number];
  stepsCount: number;
  blocks: ProcedureBlock[];
  entityDirectory: EntityRef[];
};

/** Every published procedure in Docs/Procedures, by id. */
export const PROCEDURE_IDS = ${JSON.stringify(ids)} as const;

export type ProcedureId = (typeof PROCEDURE_IDS)[number];

/** Title, goods, mode and counts for every procedure - what listing, search
 *  and intake matching read. The workflow itself comes from the registry. */
export const CATALOGUE: Record<string, ProcedureSummary> = `;

writeFileSync(OUT_TS, header + JSON.stringify(byId, null, 1) + ";\n", "utf8");

const kinds = summaries.reduce((acc, s) => ({ ...acc, [s.kind]: (acc[s.kind] ?? 0) + 1 }), {});
const steps = summaries.reduce((n, s) => n + s.stepsCount, 0);
console.log(`Wrote ${OUT_TS} (${ids.length} procedures, ${steps} steps)`);
console.log(`  kinds: ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
console.log(`  workflows: ${OUT_JSON}<id>.json`);
if (missingInputs) console.log(`  ${missingInputs} steps have no section 5 inputs listed in their document`);
