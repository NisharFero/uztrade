/* Parses every procedure in Docs/Procedures/*.docx in one pass.
 *
 * The ten hand-checked procedures were extracted one at a time
 * (extract-procedures.mjs, extract-inputs.mjs). At 246 documents that no
 * longer scales, so this reads each document once (only word/document.xml,
 * via `unzip -p`) and writes:
 *
 *   scripts/data/procedures/<id>.json   the procedure: blocks, steps, entity
 *                                       directory, and section 5 inputs per step
 *   scripts/data/catalogue.json         one summary row per procedure
 *   scripts/data/entities.json          every entity named, with the procedures
 *                                       and steps that use it and its channels
 *   scripts/data/extract-report.json    what parsed, what didn't, and why
 *
 * Each procedure is checked against its own summary table (blocks and steps);
 * a document that disagrees, or whose tables aren't where they should be, is
 * reported rather than guessed at. Nothing is written for a failed document.
 *
 * Run: node scripts/data/extract-all.mjs [--only 306,325] [--concurrency 8]
 */

import { execFile } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const DOCS = fileURLToPath(new URL("../../../../Docs/Procedures/", import.meta.url));
const OUT_DIR = fileURLToPath(new URL("./procedures/", import.meta.url));
const HERE = fileURLToPath(new URL("./", import.meta.url));

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const ONLY = arg("--only")?.split(",").map((s) => s.trim());
const CONCURRENCY = Number(arg("--concurrency") ?? 8);

/* ------------------------------------------------------------------ xml --- */

const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"');

const textOf = (xml) =>
  xml
    .split("</w:p>")
    .map((p) => decode(p.replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "")).trim())
    .filter(Boolean);

/** The document body as a sequence of paragraphs and tables (rows of cells of lines). */
function blocksOf(xml) {
  const body = xml.slice(xml.indexOf("<w:body>"));
  const out = [];
  let rest = body;
  for (;;) {
    const table = rest.indexOf("<w:tbl>");
    const head = table < 0 ? rest : rest.slice(0, table);
    for (const line of textOf(head)) out.push({ kind: "p", text: line });
    if (table < 0) break;
    const end = rest.indexOf("</w:tbl>", table);
    const tbl = rest.slice(table, end);
    const rows = tbl
      .split("</w:tr>")
      .filter((r) => r.includes("<w:tc>") || r.includes("<w:tc "))
      .map((r) =>
        r
          .split("</w:tc>")
          .filter((c) => c.includes("<w:p"))
          .map((c) => textOf(c)),
      );
    out.push({ kind: "table", rows });
    rest = rest.slice(end + "</w:tbl>".length);
  }
  return out;
}

const labelKey = (label) =>
  label
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/[^a-z0-9']+/g, " ")
    .trim();

/** Section 5, "Inputs required per step": step number -> input labels. */
function inputsFrom(xml) {
  const paras = xml.split("</w:p>").map((p) => ({
    style: p.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "",
    text: decode(p.replace(/<w:tab\/>/g, "\t").replace(/<[^>]+>/g, "")).trim(),
  }));
  const start = paras.findIndex((p) => /^5\.\s+Inputs required per step/i.test(p.text));
  if (start < 0) return new Map();
  const end = paras.findIndex((p, i) => i > start && p.style.startsWith("Heading"));
  const steps = new Map();
  let current = null;
  for (const p of paras.slice(start + 1, end < 0 ? undefined : end)) {
    const header = p.style !== "ListParagraph" && p.text.match(/^(\d+)\.\s+(.+)$/);
    if (header) {
      current = Number(header[1]);
      steps.set(current, []);
    } else if (p.style === "ListParagraph" && current != null) {
      const label = p.text.replace(/\s*\[trader supplies\]\s*$/, "").trim();
      if (label) steps.get(current).push(label);
    }
  }
  return steps;
}

/* ------------------------------------------------------------ procedure --- */

function parseProcedure(id, xml) {
  const parts = blocksOf(xml);
  const paragraphs = parts.filter((p) => p.kind === "p").map((p) => p.text);

  const titleLine = paragraphs.find((t) => new RegExp(`^Procedure ${id}\\s*:`).test(t));
  if (!titleLine) throw new Error("no title line");
  const title = titleLine.replace(new RegExp(`^Procedure ${id}\\s*:`), "").replace(/"/g, "").trim();

  const timeframe = parts
    .flatMap((p) => (p.kind === "p" ? [p.text] : p.rows.flat(2)))
    .find((t) => /End-to-end published timeframe/i.test(t))
    ?.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (!timeframe) throw new Error("no end-to-end timeframe");

  const tables = parts.filter((p) => p.kind === "table");
  if (!tables.length) throw new Error("no tables");
  const summary = (tables[0].rows[1] ?? []).map((c) => Number(c[0]));
  const entityTable = tables.find((t) => t.rows[0]?.[0]?.[0] === "Entity" && t.rows[0]?.[2]?.[0] === "Lane");
  const stepTable = tables.find((t) => t.rows[0]?.[0]?.[0] === "#" && t.rows[0]?.[1]?.[0] === "Step");
  if (!entityTable) throw new Error("no entity table");
  if (!stepTable) throw new Error("no step table");

  const entityDirectory = entityTable.rows.slice(1).map((r) => ({
    name: (r[0] ?? []).join(" "),
    steps: (r[1] ?? []).join(" "),
    lane: (r[2] ?? []).join(" "),
    contact: (r[3] ?? []).join(" "),
  }));
  const laneOf = new Map(entityDirectory.map((e) => [e.name, e.lane]));

  const blocks = [];
  for (const row of stepTable.rows.slice(1)) {
    const cells = row.filter((c) => c.length);
    if (cells.length === 1 && !/^\d+$/.test(cells[0][0])) {
      blocks.push({ name: cells[0].join(" "), steps: [] });
      continue;
    }
    if (!/^\d+$/.test(row[0]?.[0] ?? "")) continue;
    if (!blocks.length) blocks.push({ name: title, steps: [] });
    const [numCell, stepCell, entityCell, channelCell, whereCell, byCell] = row;
    const lines = stepCell ?? [];
    const output = lines.find((l) => l.startsWith("→"))?.replace(/^→\s*/, "") ?? "";
    const performedBy = (byCell ?? []).join(" ").trim();
    blocks.at(-1).steps.push({
      num: Number(numCell[0]),
      title: lines[0] ?? "",
      output,
      entity: (entityCell ?? []).join(" "),
      channel: (channelCell ?? []).join(" "),
      where: (whereCell ?? []).join(" "),
      performedBy: performedBy === "—" ? "" : performedBy,
      optional: lines.slice(1).includes("optional"),
      alternative: lines.slice(1).includes("alternative"),
    });
  }
  const withSteps = blocks.filter((b) => b.steps.length);
  if (!withSteps.length) throw new Error("no steps parsed");

  const inputs = inputsFrom(xml);
  const stepsCount = withSteps.reduce((n, b) => n + b.steps.length, 0);
  const [minH, maxH] = [Number(timeframe[1]), Number(timeframe[2])];

  const shaped = withSteps.map((b, i) => {
    const lanes = b.steps.map((s) => laneOf.get(s.entity) ?? "Other government");
    const count = new Map();
    for (const l of lanes) count.set(l, (count.get(l) ?? 0) + 1);
    const lane = [...count].sort((a, c) => c[1] - a[1])[0]?.[0] ?? "";
    const share = b.steps.length / stepsCount;
    return {
      name: b.name,
      steps: b.steps,
      id: `b${i + 1}`,
      lane,
      allLanes: [...count.keys()],
      entities: [...new Set(b.steps.map((s) => s.entity))],
      onlineCount: b.steps.filter((s) => s.channel.startsWith("Online")).length,
      inPersonCount: b.steps.filter((s) => !s.channel.startsWith("Online")).length,
      optionalSteps: b.steps.filter((s) => s.optional).map((s) => s.num),
      altSteps: b.steps.filter((s) => s.alternative).map((s) => s.num),
      stepRange: [b.steps[0].num, b.steps.at(-1).num],
      estDuration: [Math.max(1, Math.round(minH * share)), Math.max(2, Math.round(maxH * share))],
    };
  });

  // Dependencies: the latest earlier block producing a document this block needs.
  for (const [i, b] of shaped.entries()) {
    const needs = new Set(b.steps.flatMap((s) => (inputs.get(s.num) ?? []).map(labelKey)));
    let feeder = null;
    for (let j = i - 1; j >= 0; j--) {
      const produced = shaped[j].steps.find((s) => s.output && needs.has(labelKey(s.output)));
      if (produced) {
        feeder = { block: shaped[j], output: produced.output };
        break;
      }
    }
    if (i === 0) {
      b.dependsOn = [];
      b.dependencyReason = "First block in the published sequence — can start as soon as the case opens.";
    } else if (feeder) {
      b.dependsOn = [feeder.block.id];
      b.dependencyReason = `Needs “${feeder.output}” from “${feeder.block.name}” (derived from the step inputs; the procedure publishes no block dependencies).`;
    } else {
      b.dependsOn = [shaped[i - 1].id];
      b.dependencyReason = `Follows “${shaped[i - 1].name}” in the published order (no shared document found, so the order is kept).`;
    }
  }
  const levels = new Map();
  for (const b of shaped) {
    b.level = b.dependsOn.length ? Math.max(...b.dependsOn.map((d) => levels.get(d))) + 1 : 0;
    levels.set(b.id, b.level);
  }

  const published = { blocks: summary[0], steps: summary[1] };
  return {
    id,
    title,
    blocksCount: shaped.length,
    stepsCount,
    entitiesCount: Number.isFinite(summary[2]) ? summary[2] : entityDirectory.length,
    onlineCount: Number.isFinite(summary[3]) ? summary[3] : shaped.reduce((n, b) => n + b.onlineCount, 0),
    optionalCount: Number.isFinite(summary[4]) ? summary[4] : shaped.reduce((n, b) => n + b.optionalSteps.length, 0),
    altCount: Number.isFinite(summary[5]) ? summary[5] : shaped.reduce((n, b) => n + b.altSteps.length, 0),
    timeframe: `${minH}–${maxH}`,
    blocks: shaped,
    entityDirectory,
    stepInputs: Object.fromEntries([...inputs].map(([num, list]) => [num, list])),
    derived: "Blocks, dependencies and durations derived by scripts/data/extract-all.mjs from the published document",
    published,
  };
}

/* ---------------------------------------------------------------- drive --- */

const files = readdirSync(DOCS)
  // "Procedure_540_… (1).docx" is a duplicate copy of the same procedure.
  .filter((f) => /^Procedure_.+\.docx$/.test(f) && !f.startsWith("~$") && !/\(\d+\)\.docx$/.test(f))
  .map((f) => ({ file: f, id: f.match(/^Procedure_([^_]+)_/)?.[1] ?? null }))
  .filter((f) => f.id && (!ONLY || ONLY.includes(f.id)));

mkdirSync(OUT_DIR, { recursive: true });

const ok = [];
const failed = [];
const mismatched = [];

async function one({ file, id }) {
  try {
    const { stdout } = await run("unzip", ["-p", DOCS + file, "word/document.xml"], {
      maxBuffer: 256 * 1024 * 1024,
      encoding: "buffer",
    });
    const procedure = parseProcedure(id, stdout.toString("utf8"));
    const { published, ...rest } = procedure;
    const agrees = published.blocks === rest.blocksCount && published.steps === rest.stepsCount;
    if (!agrees) {
      mismatched.push({
        id,
        file,
        parsed: { blocks: rest.blocksCount, steps: rest.stepsCount },
        summary: published,
      });
    }
    writeFileSync(`${OUT_DIR}${id}.json`, JSON.stringify(rest));
    ok.push({ ...rest, file, agrees });
  } catch (error) {
    failed.push({ id, file, error: error.message });
  }
}

const queue = [...files];
await Promise.all(
  Array.from({ length: Math.max(1, CONCURRENCY) }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      await one(next);
      const done = ok.length + failed.length;
      if (done % 25 === 0) console.log(`  ${done}/${files.length} documents…`);
    }
  }),
);

ok.sort((a, b) => Number(a.id) - Number(b.id));

/* The catalogue: what the app lists and searches without loading a procedure. */
const catalogue = ok.map((p) => ({
  id: p.id,
  title: p.title,
  timeframe: p.timeframe,
  blocks: p.blocksCount,
  steps: p.stepsCount,
  online: p.onlineCount,
  entities: [...new Set(p.blocks.flatMap((b) => b.entities))].length,
}));

/* Every entity named across the corpus, and how it is reached. */
const entities = new Map();
for (const p of ok) {
  const directory = new Map(p.entityDirectory.map((e) => [e.name, e]));
  for (const block of p.blocks) {
    for (const step of block.steps) {
      const name = step.entity?.trim();
      if (!name) continue;
      const entry =
        entities.get(name) ??
        entities.set(name, {
          name,
          lane: directory.get(name)?.lane ?? "",
          contacts: new Set(),
          channels: new Map(),
          procedures: new Set(),
          steps: 0,
          onlineSteps: 0,
          sampleTitles: new Set(),
        }).get(name);
      entry.procedures.add(p.id);
      entry.steps += 1;
      if (/^online/i.test(step.channel)) entry.onlineSteps += 1;
      entry.channels.set(step.channel, (entry.channels.get(step.channel) ?? 0) + 1);
      const contact = directory.get(name)?.contact;
      if (contact && contact !== "—") entry.contacts.add(contact);
      if (entry.sampleTitles.size < 8) entry.sampleTitles.add(step.title);
      if (!entry.lane && directory.get(name)?.lane) entry.lane = directory.get(name).lane;
    }
  }
}
const entityList = [...entities.values()]
  .map((e) => ({
    name: e.name,
    lane: e.lane,
    procedures: e.procedures.size,
    procedureIds: [...e.procedures].sort((a, b) => Number(a) - Number(b)),
    steps: e.steps,
    onlineSteps: e.onlineSteps,
    channels: Object.fromEntries([...e.channels].sort((a, b) => b[1] - a[1])),
    contacts: [...e.contacts].slice(0, 3),
    sampleTitles: [...e.sampleTitles],
  }))
  .sort((a, b) => b.steps - a.steps);

writeFileSync(`${HERE}catalogue.json`, JSON.stringify(catalogue, null, 1) + "\n");
writeFileSync(`${HERE}entities.json`, JSON.stringify(entityList, null, 1) + "\n");
writeFileSync(
  `${HERE}extract-report.json`,
  JSON.stringify({ total: files.length, parsed: ok.length, failed, mismatched }, null, 1) + "\n",
);

const steps = ok.reduce((n, p) => n + p.stepsCount, 0);
const blocks = ok.reduce((n, p) => n + p.blocksCount, 0);
console.log(`\nparsed ${ok.length}/${files.length} procedures — ${blocks} blocks, ${steps} steps, ${entityList.length} distinct entities`);
if (mismatched.length) console.log(`${mismatched.length} disagree with their own summary table (see extract-report.json)`);
if (failed.length) {
  console.log(`${failed.length} could not be parsed:`);
  for (const f of failed.slice(0, 15)) console.log(`   ${f.id}: ${f.error}`);
}
