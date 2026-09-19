/* Parses procedures that dag-data.json doesn't have yet from Docs/Procedures/*.docx
 * into the same shape, and merges them into dag-data.json.
 *
 * Read from each document (only word/document.xml, via `unzip -p`):
 *   - the summary table and "End-to-end published timeframe"
 *   - section 3 "Entities in charge": entity -> lane, contacts
 *   - section 4 "Step-by-step breakdown": block rows and step rows
 *     (number, title, optional/alternative, output, entity, channel, where,
 *     performed by)
 *
 * The documents publish no per-block durations or dependencies, so for these
 * procedures both are DERIVED, and each block's dependencyReason says how:
 *   - a block depends on the latest earlier block producing a document one of
 *     its steps needs (section 5 inputs vs section 4 outputs); a block with no
 *     such link follows the block before it, as published;
 *   - the published end-to-end range is spread over the blocks by step count.
 * The five procedures already in dag-data.json are left untouched.
 *
 * Run: node scripts/data/extract-procedures.mjs && node scripts/data/extract-inputs.mjs && node scripts/data/build-procedures.mjs
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DOCS = fileURLToPath(new URL("../../../../Docs/Procedures/", import.meta.url));
const DAG = fileURLToPath(new URL("./dag-data.json", import.meta.url));
export const NEW_PROCEDURES = ["161", "57", "707", "782", "924"];

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
    for (const line of textOf(head)) {
      const style = "";
      out.push({ kind: "p", text: line, style });
    }
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

function inputsFrom(xml) {
  const paras = xml.split("</w:p>").map((p) => ({
    style: p.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "",
    text: decode(p.replace(/<w:tab\/>/g, "\t").replace(/<[^>]+>/g, "")).trim(),
  }));
  const start = paras.findIndex((p) => /^5\.\s+Inputs required per step/.test(p.text));
  const end = paras.findIndex((p, i) => i > start && p.style.startsWith("Heading"));
  const steps = new Map();
  let current = null;
  for (const p of paras.slice(start + 1, end < 0 ? undefined : end)) {
    const header = p.style !== "ListParagraph" && p.text.match(/^(\d+)\.\s+(.+)$/);
    if (header) {
      current = Number(header[1]);
      steps.set(current, []);
    } else if (p.style === "ListParagraph" && current != null) {
      steps.get(current).push(p.text.replace(/\s*\[trader supplies\]\s*$/, "").trim());
    }
  }
  return steps;
}

function parseProcedure(id) {
  const file = readdirSync(DOCS).find((f) => f.startsWith(`Procedure_${id}_`) && f.endsWith(".docx"));
  if (!file) throw new Error(`No docx for procedure ${id}`);
  const xml = execFileSync("unzip", ["-p", DOCS + file, "word/document.xml"], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
  const parts = blocksOf(xml);
  const paragraphs = parts.filter((p) => p.kind === "p").map((p) => p.text);

  const title = paragraphs
    .find((t) => t.startsWith(`Procedure ${id}:`))
    .replace(`Procedure ${id}:`, "")
    .replace(/"/g, "")
    .trim();
  const timeframe = parts
    .flatMap((p) => (p.kind === "p" ? [p.text] : p.rows.flat(2)))
    .find((t) => /End-to-end published timeframe/.test(t))
    ?.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (!timeframe) throw new Error(`Procedure ${id}: no timeframe`);

  const tables = parts.filter((p) => p.kind === "table");
  const summary = tables[0].rows[1].map((c) => Number(c[0]));
  const entityTable = tables.find((t) => t.rows[0]?.[0]?.[0] === "Entity" && t.rows[0]?.[2]?.[0] === "Lane");
  const stepTable = tables.find((t) => t.rows[0]?.[0]?.[0] === "#" && t.rows[0]?.[1]?.[0] === "Step");
  if (!entityTable || !stepTable) throw new Error(`Procedure ${id}: tables not found`);

  const entityDirectory = entityTable.rows.slice(1).map((r) => ({
    name: r[0].join(" "),
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
    const [numCell, stepCell, entityCell, channelCell, whereCell, byCell] = row;
    const lines = stepCell;
    const output = lines.find((l) => l.startsWith("→"))?.replace(/^→\s*/, "") ?? "";
    const performedBy = (byCell ?? []).join(" ").trim();
    blocks.at(-1).steps.push({
      num: Number(numCell[0]),
      title: lines[0],
      output,
      entity: entityCell.join(" "),
      channel: channelCell.join(" "),
      where: whereCell.join(" "),
      performedBy: performedBy === "—" ? "" : performedBy,
      optional: lines.slice(1).includes("optional"),
      alternative: lines.slice(1).includes("alternative"),
    });
  }

  const inputs = inputsFrom(xml);
  const stepsCount = blocks.reduce((n, b) => n + b.steps.length, 0);
  const [minH, maxH] = [Number(timeframe[1]), Number(timeframe[2])];

  const shaped = blocks.map((b, i) => {
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
    const feeders = [];
    for (let j = i - 1; j >= 0; j--) {
      const produced = shaped[j].steps.find((s) => s.output && needs.has(labelKey(s.output)));
      if (produced) {
        feeders.push({ block: shaped[j], output: produced.output });
        break;
      }
    }
    if (i === 0) {
      b.dependsOn = [];
      b.dependencyReason = "First block in the published sequence — can start as soon as the case opens.";
    } else if (feeders.length) {
      b.dependsOn = feeders.map((f) => f.block.id);
      b.dependencyReason = `Needs “${feeders[0].output}” from “${feeders[0].block.name}” (derived from the step inputs; the procedure publishes no block dependencies).`;
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

  return {
    id,
    title,
    blocksCount: shaped.length,
    stepsCount,
    entitiesCount: summary[2],
    onlineCount: summary[3],
    optionalCount: summary[4],
    altCount: summary[5],
    timeframe: `${minH}–${maxH}`,
    blocks: shaped,
    entityDirectory,
    derived: "Block dependencies and durations derived by scripts/data/extract-procedures.mjs",
    published: { blocks: summary[0], steps: summary[1] },
  };
}

const dag = JSON.parse(readFileSync(DAG, "utf8"));
for (const id of NEW_PROCEDURES) {
  const p = parseProcedure(id);
  // The parsed tables must agree with the document's own summary table.
  if (p.published.blocks !== p.blocks.length || p.published.steps !== p.stepsCount) {
    throw new Error(`Procedure ${id}: parsed ${p.blocks.length} blocks / ${p.stepsCount} steps, the summary says ${p.published.blocks} / ${p.published.steps}`);
  }
  delete p.published;
  console.log(`${id}: ${p.title} — ${p.blocksCount} blocks, ${p.stepsCount} steps, ${p.timeframe} h`);
  for (const b of p.blocks) console.log(`   ${b.id} [${b.stepRange}] ${b.name} ← ${b.dependsOn.join(",") || "-"}`);
  dag[id] = p;
}
writeFileSync(DAG, JSON.stringify(dag));
console.log(`merged into ${DAG}`);
