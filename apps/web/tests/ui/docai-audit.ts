import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseUploadedDocument } from "../../modules/documents/docai/upload";
import { specFor } from "../../modules/documents/specs";

type ScenarioDoc = { file: string; docType?: string; title: string; fields: Record<string, string> };
type Scenario = { procedureId: string; documents: ScenarioDoc[] };

const root = path.resolve("modules/demo/data");
const scenarioFiles = (await readdir(root)).filter((file) => /^scenario-.+\.json$/.test(file));
const rows: { procedureId: string; file: string; docType: string; accepted: number; review: number; missing: number; requiredOpen: string[] }[] = [];

for (const scenarioFile of scenarioFiles) {
  const scenario = JSON.parse(await readFile(path.join(root, scenarioFile), "utf8")) as Scenario;
  for (const demo of scenario.documents) {
    if (!demo.docType) continue;
    const filePath = path.resolve("public/demo", scenario.procedureId, demo.file);
    const bytes = await readFile(filePath);
    const spec = specFor(demo.docType);
    const parsed = await parseUploadedDocument({
      bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      fileName: demo.file,
      contentType: "image/png",
      spec,
      procedureId: scenario.procedureId,
      baseUrl: "http://127.0.0.1:1",
      parseWithAi: async () => { throw new Error("offline audit: use deterministic demo reader"); },
    });
    rows.push({ procedureId: scenario.procedureId, file: demo.file, docType: demo.docType, ...parsed.document.summary });
  }
}

const failures = rows.filter((row) => row.requiredOpen.length);
const byType = new Map<string, typeof rows>();
for (const row of rows) byType.set(row.docType, [...(byType.get(row.docType) ?? []), row]);
const failingTypes = [...new Set(failures.map((row) => row.docType))].map((docType) => ({
  docType,
  files: failures.filter((row) => row.docType === docType).length,
  requiredOpen: [...new Set(failures.filter((row) => row.docType === docType).flatMap((row) => row.requiredOpen))],
}));
console.log(JSON.stringify({ files: rows.length, documentTypes: byType.size, passed: rows.length - failures.length, failures: failures.length, failingTypes }, null, 2));
assert.equal(failures.length, 0, `${failures.length} demo documents have required fields not accepted`);
