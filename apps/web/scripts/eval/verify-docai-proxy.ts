import { readFileSync } from "node:fs";
import { parseWithDocai } from "../../modules/documents/docai/client";
import { composeDocument } from "../../modules/documents/docai/compose";
import { specFor, type DocType } from "../../modules/documents/specs";

type ScenarioDoc = {
  file: string;
  docType: DocType | null;
  fields: Record<string, string>;
};

type Scenario = { documents: ScenarioDoc[] };

const url = process.env.DOCAI_URL ?? "http://127.0.0.1:8765";
const scenario = JSON.parse(readFileSync("./modules/demo/data/scenario-868.json", "utf8")) as Scenario;
const files = [
  "01-foreign-trade-contract.png",
  "21-commercial-invoice.png",
  "26-phytosanitary-certificate-step-31.png",
];

const norm = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/\s+/g, " ")
    .trim();

for (const file of files) {
  const doc = scenario.documents.find((item) => item.file === file);
  if (!doc?.docType) throw new Error(`${file} is missing a parsed document type`);
  const spec = specFor(doc.docType);
  const bytes = readFileSync(`./public/demo/868/${file}`);
  const started = Date.now();
  const response = await parseWithDocai(
    {
      bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      fileName: file,
      contentType: "image/png",
      spec,
    },
    url,
  );
  const parsed = composeDocument(spec, response);
  const fields = Object.entries(doc.fields).map(([key, expected]) => {
    const field = parsed.fields.find((item) => item.key === key);
    const expectedHead = norm(expected).split(",")[0];
    const ok = Boolean(field?.value) && norm(field?.value).includes(expectedHead);
    return {
      key,
      expected,
      value: field?.value ?? null,
      status: field?.status ?? "missing",
      confidence: field?.confidence ?? 0,
      ok,
    };
  });

  console.log(
    JSON.stringify(
      {
        file,
        seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
        detectedType: parsed.detectedType,
        typeMatches: parsed.typeMatches,
        correct: fields.filter((field) => field.ok).length,
        expected: fields.length,
        wrongAccepted: fields.filter((field) => !field.ok && field.status === "accepted").length,
        fields,
      },
      null,
      2,
    ),
  );
}
