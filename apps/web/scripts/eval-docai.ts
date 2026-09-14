/* Evaluates document parsing on the published specimens.
 *
 * Filled specimens have ground truth transcribed from the images; blank forms
 * measure false positives (a printed label accepted as a value). Runs the
 * same path as an upload: docai service -> compose -> gate.
 *
 * Run (service on :8765): npm run eval:docai
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseWithDocai } from "../app/lib/docai/client";
import { composeDocument, type ExtractedField } from "../app/lib/docai/compose";
import { specFor, type DocType } from "../app/lib/document-specs";

type Expect = { contains?: string; normalized?: string | number };
type Case = { file: string; source: string; docType: DocType; blank?: boolean; expect?: Record<string, Expect> };

const ROOT = fileURLToPath(new URL("../../docai/eval/", import.meta.url));
const url = process.env.DOCAI_URL ?? "http://127.0.0.1:8765";
const DEMO = process.argv.includes("--demo");

/* --demo: score the generated 868 demo pages against the scenario values they
 * were rendered from (every field the document's spec parses). */
function demoCases(): Case[] {
  const scenario = JSON.parse(readFileSync(fileURLToPath(new URL("../app/data/demo/scenario-868.json", import.meta.url)), "utf8")) as {
    documents: { file: string; title: string; docType: DocType | null; fields: Record<string, string> }[];
  };
  return scenario.documents
    .filter((d) => d.docType)
    .map((d) => {
      const parsed = new Set(specFor(d.docType!).fields.filter((f) => f.questions.length || f.anchors.length).map((f) => f.key));
      const expect = Object.fromEntries(
        Object.entries(d.fields)
          .filter(([key]) => parsed.has(key))
          .map(([key, value]) => [key, { contains: value.replace(/["']/g, "").split(",")[0].trim() }]),
      );
      // Case files are read from eval/specimens/, so climb specimens → eval → docai → apps.
      return { file: `../../../web/public/demo/868/${d.file}`, source: `DEMO · ${d.title}`, docType: d.docType!, expect };
    });
}

const norm0 = (v: unknown) => String(v ?? "").replace(/["']/g, "");
const cases = DEMO ? demoCases() : (JSON.parse(readFileSync(`${ROOT}ground-truth.json`, "utf8")) as Case[]);
const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();

function correct(field: ExtractedField | undefined, expect: Expect): boolean {
  if (!field?.value) return false;
  if (expect.normalized != null) {
    return typeof expect.normalized === "number"
      ? Math.abs(Number(field.normalized) - expect.normalized) < 1e-6
      : norm(field.normalized) === norm(expect.normalized);
  }
  return norm(norm0(field.value)).includes(norm(norm0(expect.contains)));
}

const totals = { expected: 0, correct: 0, correctAccepted: 0, correctReview: 0, wrongAccepted: 0, notFound: 0, blankFields: 0, blankAccepted: 0, blankReview: 0 };
const report: unknown[] = [];
const lines: string[] = [];

for (const c of cases) {
  const bytes = readFileSync(`${ROOT}specimens/${c.file}`);
  const spec = specFor(c.docType);
  const started = Date.now();
  const response = await parseWithDocai(
    {
      bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      fileName: c.file.split("/").pop() ?? c.file,
      contentType: c.file.endsWith(".png") ? "image/png" : "image/jpeg",
      spec,
    },
    url,
  );
  const parsed = composeDocument(spec, response);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const fieldRows: unknown[] = [];

  if (c.blank) {
    const accepted = parsed.fields.filter((f) => f.status === "accepted");
    const review = parsed.fields.filter((f) => f.status === "review");
    totals.blankFields += parsed.fields.length;
    totals.blankAccepted += accepted.length;
    totals.blankReview += review.length;
    lines.push(
      `| ${c.file} | blank | ${parsed.detectedType ?? "—"} | ${accepted.length} accepted / ${review.length} review of ${parsed.fields.length} | ${seconds}s |`,
    );
    for (const f of [...accepted, ...review]) fieldRows.push({ key: f.key, value: f.value, confidence: f.confidence, status: f.status });
  } else {
    let ok = 0;
    const misses: string[] = [];
    for (const [key, expect] of Object.entries(c.expect ?? {})) {
      const field = parsed.fields.find((f) => f.key === key);
      const hit = correct(field, expect);
      totals.expected++;
      if (hit) {
        ok++;
        totals.correct++;
        if (field!.status === "accepted") totals.correctAccepted++;
        else totals.correctReview++;
      } else {
        if (field?.status === "accepted") totals.wrongAccepted++;
        if (!field?.value) totals.notFound++;
        misses.push(`${key}=${JSON.stringify(field?.value ?? null)}`);
      }
      fieldRows.push({ key, expected: expect, value: field?.value ?? null, normalized: field?.normalized ?? null, confidence: field?.confidence ?? 0, status: field?.status ?? "missing", correct: hit });
    }
    lines.push(`| ${c.file} | ${ok}/${Object.keys(c.expect ?? {}).length} | ${parsed.detectedType ?? "—"} | ${misses.join("; ") || "—"} | ${seconds}s |`);
  }
  report.push({ ...c, seconds: Number(seconds), detectedType: parsed.detectedType, typeMatches: parsed.typeMatches, fields: fieldRows, ocrSegments: response.pages.map((p) => p.segments) });
  console.error(`done ${c.file} in ${seconds}s`);
}

console.log("| Specimen | Correct | Detected type | Misses / false positives | Time |");
console.log("|---|---|---|---|---|");
for (const line of lines) console.log(line);
console.log("");
console.log(
  `Filled specimens: ${totals.correct}/${totals.expected} fields correct ` +
    `(${totals.correctAccepted} auto-accepted, ${totals.correctReview} needing review); ` +
    `${totals.wrongAccepted} wrong values auto-accepted; ${totals.notFound} not found.`,
);
console.log(`Blank forms: ${totals.blankAccepted} of ${totals.blankFields} fields wrongly accepted, ${totals.blankReview} sent to review.`);
writeFileSync(`${ROOT}${DEMO ? "report-demo-868.json" : "report.json"}`, JSON.stringify({ totals, report }, null, 2));
