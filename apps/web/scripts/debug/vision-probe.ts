/* One-off: read a real document image with the Groq vision reader and show what
 * the gates make of it.
 *
 *   GROQ_API_KEY=... npx tsx scripts/debug/vision-probe.ts public/demo/868/12-commercial-invoice.png commercial_invoice
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { composeDocument } from "../../modules/documents/docai/compose";
import { parseWithGroqVision } from "../../modules/documents/docai/groq-vision";
import { specFor, type DocType } from "../../modules/documents/specs";

const key = process.env.GROQ_API_KEY;
if (!key) {
  console.error("no GROQ_API_KEY in the environment");
  process.exit(1);
}

const file = process.argv[2];
const docType = (process.argv[3] ?? "commercial_invoice") as DocType;
if (!file) {
  console.error("usage: vision-probe.ts <image> [docType]");
  process.exit(1);
}

const buffer = readFileSync(file);
const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
const spec = specFor(docType);

const started = Date.now();
const response = await parseWithGroqVision(
  { bytes, fileName: basename(file), contentType: "image/png", spec },
  { apiKey: key, model: process.env.GROQ_VISION_MODEL },
);
const ms = Date.now() - started;

const document = composeDocument(spec, response);
console.log(`${file}  ->  ${spec.name}   ${ms} ms   model ${response.models?.qa}`);
console.log(`transcript: ${response.text.split("\n").length} lines, ${response.text.length} chars`);
console.log(`readable: ${response.readability?.readable}  ${response.readability?.reason}`);
console.log(`\nsummary: ${document.summary.accepted} accepted · ${document.summary.review} review · ${document.summary.missing} missing\n`);
for (const f of document.fields) {
  const mark = f.status === "accepted" ? "+" : f.status === "review" ? "?" : " ";
  console.log(`${mark} ${f.label.padEnd(30)} ${String(f.value ?? "").slice(0, 44).padEnd(46)} ${f.confidence.toFixed(2)}  ${f.evidence?.label ?? f.evidence?.question ?? ""}`);
}
