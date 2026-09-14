/* Prints the raw candidates the document AI returned for chosen fields - the
 * evidence for why a value was accepted (source, value, score).
 *
 * Run (service on :8765):
 *   npx tsx scripts/debug-candidates.ts ../docai/eval/specimens/<file> <docType> key1,key2
 */

import { readFileSync } from "node:fs";
import { parseWithDocai } from "../app/lib/docai/client";
import { specFor, type DocType } from "../app/lib/document-specs";

const [file, docType, keys = ""] = process.argv.slice(2);
if (!file || !docType) {
  console.error("usage: debug-candidates.ts <file> <docType> key1,key2");
  process.exit(2);
}

const bytes = readFileSync(file);
const response = await parseWithDocai({
  bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  fileName: file.split(/[\\/]/).pop() ?? file,
  contentType: file.endsWith(".png") ? "image/png" : "image/jpeg",
  spec: specFor(docType as DocType),
});

console.log("readability", JSON.stringify(response.readability), "timings", JSON.stringify(response.timings));
for (const key of keys.split(",").filter(Boolean)) {
  const candidates = response.fields[key]?.candidates ?? [];
  console.log(key, JSON.stringify(candidates.map((c) => [c.source, c.value, Math.round(c.score * 100) / 100])));
}
