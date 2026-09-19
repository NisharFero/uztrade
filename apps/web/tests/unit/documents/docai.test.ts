import assert from "node:assert/strict";
import test from "node:test";
import { applyCorrections, composeDocument, composeField, GATE } from "../../../modules/documents/docai/compose";
import { crossCheck } from "../../../modules/documents/docai/crosscheck";
import { parseUploadedDocument } from "../../../modules/documents/docai/upload";
import { detectDocType, originForm } from "../../../modules/documents/docai/doctype";
import { normalizeDate, normalizeValue, parseNumber, parseTonnes } from "../../../modules/documents/docai/validate";
import { DOC_SPECS, specFor, type DocType } from "../../../modules/documents/specs";

test("validators read the formats seen on the specimens", () => {
  assert.equal(normalizeDate("02.03.2021"), "2021-03-02");
  assert.equal(normalizeDate("13 АВГ 2021"), "2021-08-13");
  assert.equal(normalizeDate("16-3-2021 й."), "2021-03-16");
  assert.equal(normalizeDate("не дата"), null);
  assert.equal(parseNumber("1 790 128,00"), 1790128);
  assert.equal(parseNumber("68.75 т"), 68.75);
  assert.equal(parseTonnes("68000 кг"), 68);
  assert.equal(parseTonnes("68,75 т"), 68.75);
  assert.deepEqual(normalizeValue("hs", "4407 11 90 00"), { ok: true, normalized: "4407119000" });
  assert.equal(normalizeValue("inn", "200640719").ok, true);
  assert.equal(normalizeValue("inn", "2006407").ok, false);
  assert.equal(normalizeValue("currency", "Валюта инвойса: USD").normalized, "USD");
  assert.equal(normalizeValue("currency", "840").normalized, "USD");
  assert.equal(normalizeValue("incoterm", "DAP st. Alashinkoy").normalized, "DAP");
  assert.equal(normalizeValue("country", "РЕСПУБЛИКА УЗБЕКИСТАН").normalized, "UZ");
});

test("OCR letter-for-digit confusions are corrected inside numbers, not inside words", () => {
  // Seen on the synthetic A4 invoice: EasyOCR read zeros as Cyrillic "О".
  assert.equal(parseNumber("60 00О kg"), 60000);
  assert.equal(parseTonnes("60 00О kg"), 60);
  assert.equal(parseNumber("192 0ОО.00"), 192000);
  assert.equal(normalizeValue("hs", "O9O2 40").normalized, "090240");
  assert.equal(normalizeValue("text", "ООО Московский Чай").normalized, "ООО Московский Чай");
});

test("confidence gate: agreement raises it, a failed validator or a printed label cuts it", () => {
  const spec = specFor("phytosanitary_certificate");
  const quantity = spec.fields.find((f) => f.key === "quantity")!;
  const labels = [/quantity declared/i, /name of produce/i];

  const agreed = composeField(quantity, [
    { value: "68,75 т", score: 0.72, source: "layoutlm" },
    { value: "68.75 t", score: 0.6, source: "anchor-below" },
  ], labels);
  assert.equal(agreed.status, "accepted");
  assert.equal(agreed.normalized, 68.75);
  assert.ok(agreed.confidence >= GATE.accept);

  const blank = composeField(quantity, [{ value: "Quantity declared", score: 0.9, source: "layoutlm" }], labels);
  assert.equal(blank.status, "missing", "a blank form's printed label is not a value");

  const invalid = composeField(spec.fields.find((f) => f.key === "issue_date")!, [{ value: "Signature", score: 0.95, source: "layoutlm" }], labels);
  assert.notEqual(invalid.status, "accepted");
});

test("an unreadable scan is reported with its measured reason, not parsed into junk", () => {
  const parsed = composeDocument(specFor("phytosanitary_certificate"), {
    pages: [{ width: 549, height: 750, segments: 76 }],
    text: "КАЗАКСТАН РЕСПУБИКАсЫ",
    fields: { quantity: { candidates: [{ value: "68", score: 0.9, source: "anchor-inline" }] } },
    readability: { readable: false, medianHeight: 8, meanConfidence: 0.11, reason: "Text is about 8 px high and OCR confidence is 0.11" },
  });
  assert.equal(parsed.unreadable, "Text is about 8 px high and OCR confidence is 0.11");
  assert.ok(parsed.fields.every((f) => f.status === "missing"));
  assert.equal(parsed.summary.accepted, 0);
});

test("the title nearest the top decides the type, not a later mention of another document", () => {
  // Synthetic A4 invoice was detected as a railway bill because of "Bill of lading № SMGS" on line 11.
  assert.equal(
    detectDocType("СЧЕТ/INVOICE № INV-2026/0457\nДата/Date: 12.09.2026\nТранспортный документ/WAYBILL/CMR/Bill of lading № SMGS 77120045"),
    "commercial_invoice",
  );
  assert.equal(detectDocType("Накладная СМГС\n24 Документы, приложенные отправителем: счет фактура, фитосанитарный сертификат"), "railway_bill");
});

test("a title OCR ran together is still found: 'СЧЕТ/INVOICE' read as 'CЧЕTIINVOICE'", () => {
  // Real OCR of the synthetic A4 invoice: the slash became "I", so "\binvoice\b" missed the
  // title and "SMGS" further down decided the type.
  const text = [
    "CЧЕTIINVOICE Ng INV-2026/0457",
    "Дата/Date: 12.09.2026",
    "Транспортный документIWAYBILLICMRIBill of lading Ng SMGS 77120045",
    "Валюта инвойса/Currency of invoice: USD",
  ].join("\n");
  assert.equal(detectDocType(text), "commercial_invoice");
});

test("document type is checked from the printed title", () => {
  assert.equal(detectDocType("РЕСПУБЛИКА КАЗАХСТАН\nФИТОСАНИТАРНЫЙ СЕРТИФИКАТ\nPHYTOSANITARY CERTIFICATE"), "phytosanitary_certificate");
  assert.equal(detectDocType("УПАКОВОЧНЫЙ ЛИСТ № / PACKING LIST №\nSELLER/ПРОДАВЕЦ"), "packing_list");
  assert.equal(detectDocType("ГРУЗОВАЯ ТАМОЖЕННАЯ ДЕКЛАРАЦИЯ ТД 1"), "customs_declaration");
  assert.equal(originForm("СЕРТИФИКАТ О ПРОИСХОЖДЕНИИ ТОВАРА ФОРМА СТ-1"), "CT-1");

  const parsed = composeDocument(specFor("commercial_invoice"), {
    pages: [{ width: 1600, height: 2200, segments: 40 }],
    text: "УПАКОВОЧНЫЙ ЛИСТ № / PACKING LIST № 12",
    fields: {},
  });
  assert.equal(parsed.typeMatches, false);
  assert.equal(parsed.detectedType, "packing_list");
  assert.ok(parsed.summary.requiredOpen.includes("Invoice number"));
});

test("trader corrections confirm fields at full confidence", () => {
  const spec = specFor("receipt_of_payment");
  const parsed = composeDocument(spec, {
    pages: [{ width: 1600, height: 1100, segments: 20 }],
    text: "КВИТАНЦИЯ",
    fields: { amount: { candidates: [{ value: "245000", score: 0.62, source: "layoutlm" }] } },
  });
  const amount = parsed.fields.find((f) => f.key === "amount")!;
  assert.equal(amount.status, "review");
  const fixed = applyCorrections(parsed.fields, { payer: "OOO Samarkand Tea", date: "20.09.2026" }, true);
  assert.equal(fixed.find((f) => f.key === "amount")!.status, "confirmed");
  assert.equal(fixed.find((f) => f.key === "date")!.normalized, "2026-09-20");
});

test("a confident model answer over poorly read OCR is not auto-accepted", () => {
  // Import SMGS: page OCR confidence 0.30; LayoutLM said "6202" at 1.00 - the wrong number.
  const response = (meanConfidence: number) => ({
    pages: [{ width: 1240, height: 1700, segments: 78 }],
    text: "Накладная СМГС",
    fields: { weight: { candidates: [{ value: "6202", score: 1, source: "layoutlm" }] } },
    readability: { readable: true, medianHeight: 12, meanConfidence, reason: "" },
  });
  const weightOf = (r: ReturnType<typeof response>) => composeDocument(specFor("railway_bill"), r).fields.find((f) => f.key === "weight")!;
  assert.notEqual(weightOf(response(0.3)).status, "accepted");
  assert.equal(weightOf(response(0.75)).status, "accepted", "a clean page keeps the model's confidence");
});

test("one answer given for both seller and buyer is not trusted where the field's own label disagrees", () => {
  // Synthetic invoice: LayoutLM gave "Samarkand Choy" for both; the buyer's label line says Московский Чай.
  const parsed = composeDocument(specFor("commercial_invoice"), {
    pages: [{ width: 1280, height: 1811, segments: 26 }],
    text: "СЧЕТ/INVOICE",
    fields: {
      seller: { candidates: [{ value: "\"Samarkand Choy\"", score: 0.8, source: "layoutlm" }, { value: "ОOО \"Samarkand Choy\"", score: 0.42, source: "anchor-inline" }] },
      buyer: { candidates: [{ value: "\"Samarkand Choy\"", score: 0.82, source: "layoutlm" }, { value: "ООО \"Московский Чай'", score: 0.47, source: "anchor-inline" }] },
    },
    readability: { readable: true, medianHeight: 28.5, meanConfidence: 0.75, reason: "" },
  });
  const buyer = parsed.fields.find((f) => f.key === "buyer")!;
  assert.notEqual(buyer.status, "accepted");
  assert.match(buyer.value ?? "", /Московский/);
  assert.match(parsed.fields.find((f) => f.key === "seller")!.value ?? "", /Samarkand/);
});

test("a receipt is checked against the bill issued since the previous payment", () => {
  const doc = (docType: DocType, key: string, value: string, stepNum: number) => ({
    docType,
    label: specFor(docType).name,
    stepNum,
    fields: [composeField(specFor(docType).fields.find((f) => f.key === key)!, [{ value, score: 0.9, source: "layoutlm" }], [])],
  });
  const receipt = (value: string) => [composeField(specFor("receipt_of_payment").fields.find((f) => f.key === "amount")!, [{ value, score: 0.9, source: "layoutlm" }], [])];
  const documents = [
    doc("invoice_for_payment", "total", "2 350 000", 8),
    doc("receipt_of_payment", "amount", "2 350 000", 9),
    doc("offer_agreement", "amount", "245 000", 11),
    doc("offer_agreement", "amount", "490 000", 27),
    doc("invoice_for_payment", "total", "780 000", 33),
    doc("receipt_of_payment", "amount", "780 000", 33),
  ];
  const context = { intakeTonnes: 60, partnerCountry: "RU", direction: "export" as const, goodsCategory: "tea", documents };

  const step12 = crossCheck("receipt_of_payment", receipt("245 000"), { ...context, stepNum: 12 }).find((c) => c.check === "Receipt amount vs bill")!;
  assert.equal(step12.status, "ok");
  assert.match(step12.detail, /245000 paid vs 245000 billed/);

  const step42 = crossCheck("receipt_of_payment", receipt("1 500 000"), { ...context, stepNum: 42 });
  assert.equal(step42.some((c) => c.check === "Receipt amount vs bill"), false, "no bill since the step-33 payment");
});

test("cross-checks report the values they compared", () => {
  const spec = specFor("commercial_invoice");
  const field = (key: string, value: string) => composeField(spec.fields.find((f) => f.key === key)!, [{ value, score: 0.9, source: "layoutlm" }], []);
  const invoice = [field("quantity", "58 000 kg"), field("hs_code", "0902 30"), field("goods", "Black tea in bags"), field("currency", "USD")];
  const packing = [composeField(specFor("packing_list").fields.find((f) => f.key === "hs_code")!, [{ value: "0902 10", score: 0.9, source: "layoutlm" }], [])];

  const checks = crossCheck("commercial_invoice", invoice, {
    intakeTonnes: 60,
    partnerCountry: "RU",
    direction: "export",
    goodsCategory: "tea",
    documents: [{ docType: "packing_list", label: "Packing list", fields: packing }],
  });
  const quantity = checks.find((c) => c.check === "Quantity vs intake")!;
  assert.equal(quantity.status, "mismatch");
  assert.match(quantity.detail, /58 t .* 60 t/);
  assert.equal(checks.find((c) => c.check.startsWith("HS code"))!.status, "ok", "same 4-digit heading");
  assert.equal(checks.find((c) => c.check === "Goods vs intake")!.status, "ok");
});

test("every parsed field has a kind, and every document with a specimen has questions or anchors", () => {
  for (const spec of Object.values(DOC_SPECS)) {
    for (const f of spec.fields) assert.ok(f.kind, `${spec.type}.${f.key}`);
    if (spec.fields.some((f) => f.source === "specimen")) {
      assert.ok(spec.fields.some((f) => f.questions.length && f.anchors.length), spec.type);
    }
    for (const a of spec.fields.flatMap((f) => f.anchors)) assert.doesNotThrow(() => new RegExp(a, "i"), `${spec.type}: ${a}`);
  }
});

test("known demo uploads are analyzed when the document AI service is unavailable", async () => {
  const parsed = await parseUploadedDocument({
    bytes: new ArrayBuffer(0),
    fileName: "21-commercial-invoice.png",
    contentType: "image/png",
    spec: specFor("commercial_invoice"),
    parseWithAi: async () => {
      throw new Error("The document AI service isn't reachable at http://127.0.0.1:8765");
    },
  });

  assert.equal(parsed.parseError, null);
  assert.equal(parsed.document.typeMatches, true);
  assert.equal(parsed.document.fields.find((f) => f.key === "invoice_no")?.status, "accepted");
  assert.equal(parsed.document.fields.find((f) => f.key === "invoice_no")?.normalized, "INV-2026/0457");
  assert.equal(parsed.document.fields.find((f) => f.key === "quantity")?.normalized, 60);
  assert.equal(parsed.document.fields.find((f) => f.key === "currency")?.normalized, "USD");
});
