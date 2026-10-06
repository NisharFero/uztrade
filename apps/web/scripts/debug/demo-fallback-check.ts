/* One-off: can a demo run read documents with no model at all?
 *
 * The 868 demo pack ships known values per file. When no reader is configured
 * (DOC_READER=docai with no DOCAI_URL deployed), an uploaded demo file should
 * fall back to those values rather than to a blank document - which is a
 * document-reading demo that costs no tokens and cannot be rate limited.
 */
import { readFileSync } from "node:fs";
import { parseUploadedDocument } from "../../modules/documents/docai/upload";
import { specFor } from "../../modules/documents/specs";

const file = "public/demo/868/21-commercial-invoice.png";
const buffer = readFileSync(file);
const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

const parsed = await parseUploadedDocument({
  bytes,
  fileName: "21-commercial-invoice.png",
  contentType: "image/png",
  spec: specFor("commercial_invoice"),
  procedureId: "868",
  baseUrl: "", // nothing deployed to read it
});

console.log(`fallback: ${parsed.fallback}`);
console.log(`parse error: ${parsed.parseError ?? "none"}`);
console.log(
  `fields: ${parsed.document.summary.accepted} accepted · ${parsed.document.summary.review} review · ${parsed.document.summary.missing} missing`,
);
for (const f of parsed.document.fields.slice(0, 6)) {
  console.log(`  ${f.label.padEnd(28)} ${String(f.value ?? "—").slice(0, 40)}`);
}
