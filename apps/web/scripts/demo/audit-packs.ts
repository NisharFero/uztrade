/** Verify demo source values through the real field gates and cross-checks.
 * This is a deterministic fixture audit, not an OCR accuracy measurement. */
import { readFileSync, writeFileSync } from "node:fs";
import { DEMO_PROCEDURES, demoFor } from "../../modules/demo/demo";
import { specFor, type DocType } from "../../modules/documents/specs";
import { composeDocument } from "../../modules/documents/docai/compose";
import { crossCheck, type LedgerDocument } from "../../modules/documents/docai/crosscheck";
import { extractShipmentFacts } from "../../modules/workflow/domain";
import { mentionedRoute, toTonnes } from "../../modules/intake/shipment-plan";
import { CATALOGUE } from "../../modules/procedures/data/procedures.generated";

const results = DEMO_PROCEDURES.map((id) => {
  const scenario = demoFor(id)!;
  const facts = extractShipmentFacts(String(scenario.shipment.query));
  const procedure = CATALOGUE[id];
  const route = mentionedRoute(facts, String(scenario.shipment.query));
  const ledger: LedgerDocument[] = [];
  const documents = [...scenario.documents].sort((a, b) => Math.min(...a.steps) - Math.min(...b.steps) || Number(a.output) - Number(b.output)).map((doc) => {
    const bytes = readFileSync(`public/demo/${id}/${doc.file}`);
    const image = { validPng: bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    const imageIssues = !image.validPng || image.width < 1240 || image.height < 1754 ? ["Invalid PNG or below A4 demo resolution"] : [];
    if (!doc.docType) return { file: doc.file, image, untyped: true, issues: imageIssues };
    const spec = specFor(doc.docType as DocType);
    const parsed = composeDocument(spec, {
      docType: doc.docType, text: doc.title, pages: [{ width: image.width, height: image.height, segments: Object.keys(doc.fields).length }],
      fields: Object.fromEntries(spec.fields.map((field) => [field.key, { candidates: doc.fields[field.key] ? [{ value: doc.fields[field.key], score: .96, source: "demo-pack", label: field.name, page: 0 }] : [] }])),
      readability: { readable: true, medianHeight: 18, meanConfidence: .9, reason: "fixture values, not OCR" },
    });
    const checks = crossCheck(doc.docType as DocType, parsed.fields, {
      intakeTonnes: facts.quantity == null ? null : toTonnes(facts.quantity, facts.unit, procedure.goods),
      partnerCountry: procedure.direction === "export" ? route.destination?.country ?? null : route.origin?.country ?? null,
      direction: procedure.direction === "transit" ? null : procedure.direction,
      goodsCategory: procedure.goods, goodsTerm: String(scenario.shipment.goods), documents: ledger, stepNum: Math.min(...doc.steps),
    });
    ledger.push({ docType: doc.docType as DocType, label: doc.title, fields: parsed.fields, stepNum: Math.min(...doc.steps) });
    const issues = [
      ...imageIssues,
      ...parsed.fields.filter((field) => field.required && field.status !== "accepted").map((field) => `Required ${field.key}: ${field.status} (${field.value ?? "empty"})`),
      ...checks.filter((check) => check.status !== "ok").map((check) => `${check.status}: ${check.check}: ${check.detail}`),
    ];
    return { file: doc.file, docType: doc.docType, image, summary: parsed.summary, checks, issues };
  });
  const issues = documents.flatMap((doc) => doc.issues.map((issue) => `${doc.file}: ${issue}`));
  return { procedureId: id, title: procedure.title, documentCount: documents.length, issueCount: issues.length, issues, documents };
});
writeFileSync(process.argv[2] ?? "/tmp/uztrade-demo-document-audit.json", JSON.stringify({ scope: "Source-value validation and cross-document checks; does not certify OCR or authenticity", results }, null, 2) + "\n");
for (const result of results) console.log(`${result.procedureId}: ${result.documentCount} documents, ${result.issueCount} issues`);
for (const result of results) for (const issue of result.issues) console.log(`${result.procedureId}: ${issue}`);
process.exitCode = results.some((r) => r.issueCount) ? 1 : 0;
