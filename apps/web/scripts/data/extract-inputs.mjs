/* Extracts section 5 "Inputs required per step" from the five procedure .docx
 * files into scripts/data/inputs-data.json.
 *
 * dag-data.json never captured this section. Only document.xml is read (via
 * `unzip -p`), so the multi-MB images are skipped. The output is committed;
 * build-procedures.mjs merges it into procedures.generated.ts.
 *
 * Run: node scripts/data/extract-inputs.mjs
 */

import { execFileSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DOCS = fileURLToPath(new URL("../../../../Docs/Procedures/", import.meta.url));
const OUT = fileURLToPath(new URL("./inputs-data.json", import.meta.url));
const IN_SCOPE = ["306", "325", "477", "540", "868"];

const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"');

function paragraphs(xml) {
  return xml.split("</w:p>").map((p) => ({
    style: p.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "",
    text: decode(p.replace(/<w:tab\/>/g, "\t").replace(/<[^>]+>/g, "")).trim(),
  }));
}

const result = {};

for (const id of IN_SCOPE) {
  const file = readdirSync(DOCS).find((f) => f.startsWith(`Procedure_${id}_`) && f.endsWith(".docx"));
  if (!file) throw new Error(`No docx for procedure ${id}`);
  const xml = execFileSync("unzip", ["-p", DOCS + file, "word/document.xml"], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
  const paras = paragraphs(xml);

  const start = paras.findIndex((p) => /^5\.\s+Inputs required per step/.test(p.text));
  if (start < 0) throw new Error(`Procedure ${id}: section 5 not found`);
  const end = paras.findIndex((p, i) => i > start && p.style.startsWith("Heading"));

  const steps = [];
  for (const p of paras.slice(start + 1, end < 0 ? undefined : end)) {
    if (!p.text) continue;
    const header = p.style !== "ListParagraph" && p.text.match(/^(\d+)\.\s+(.+)$/);
    if (header) {
      steps.push({ num: Number(header[1]), title: header[2].trim(), inputs: [] });
      continue;
    }
    if (p.style === "ListParagraph" && steps.length) {
      const label = p.text.replace(/\s*\[trader supplies\]\s*$/, "").trim();
      if (label) steps.at(-1).inputs.push(label);
    }
  }

  result[id] = { steps };
  const count = steps.reduce((n, s) => n + s.inputs.length, 0);
  console.log(`${id}: ${steps.length} steps, ${count} inputs`);
}

writeFileSync(OUT, JSON.stringify(result, null, 1) + "\n");
console.log(`wrote ${OUT}`);
