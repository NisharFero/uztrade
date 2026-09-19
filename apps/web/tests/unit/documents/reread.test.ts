import assert from "node:assert/strict";
import test from "node:test";
import { createLlmClient } from "../../../modules/ai/llm";
import type { ExtractedField } from "../../../modules/documents/docai/compose";
import { rereadUncertainFields } from "../../../modules/documents/docai/reread";

const field = (key: string, kind: ExtractedField["kind"], value: string | null, status: ExtractedField["status"], confidence: number): ExtractedField => ({
  key,
  label: key,
  kind,
  required: true,
  value,
  normalized: value,
  confidence,
  status,
  source: value ? "layoutlm" : null,
  alternatives: [],
});

const OCR = "СЧЕТ / INVOICE № INV-2026/017\nМесто и дата / Place and date: Tashkent, 12.09.2026\nВалюта инвойса / Currency of invoice: USD\nTotal value 84 000,00";

const fields = () => [
  field("invoice_no", "number", "INV-2026/017", "review", 0.62),
  field("invoice_date", "date", null, "missing", 0),
  field("currency", "currency", null, "missing", 0),
  field("total_value", "amount", "84 000,00", "accepted", 0.9),
];

const reading = {
  fields: [
    { key: "invoice_no", value: "INV-2026/017", quote: "INVOICE № INV-2026/017" },
    { key: "invoice_date", value: "12.09.2026", quote: "Place and date: Tashkent, 12.09.2026" },
    { key: "currency", value: "EUR", quote: "Currency of invoice: EUR" },
  ],
};

test("a local second reading: agreement is accepted, a found value goes to review, an unquoted one is discarded", async () => {
  const local = createLlmClient({
    localUrl: "http://127.0.0.1:11434/v1",
    fetch: (async () => new Response(JSON.stringify({ model: "qwen", choices: [{ message: { content: JSON.stringify(reading) } }] }))) as unknown as typeof fetch,
  });
  const { fields: out, reread } = await rereadUncertainFields(fields(), OCR, local);
  const by = new Map(out.map((f) => [f.key, f]));
  assert.deepEqual(reread, ["invoice_no", "invoice_date"]);
  assert.equal(by.get("invoice_no")?.status, "accepted", "two independent readings agree");
  assert.equal(by.get("invoice_date")?.status, "review", "the trader still confirms a value only the model found");
  assert.equal(by.get("invoice_date")?.value, "12.09.2026");
  assert.equal(by.get("currency")?.status, "missing", "EUR isn't what the page says");
  assert.equal(by.get("total_value")?.status, "accepted");
});

test("without a local model the OCR text goes nowhere and nothing changes", async () => {
  const neverCalled = (async () => assert.fail("OCR text must not go to Groq")) as unknown as typeof fetch;
  const before = fields();
  const { fields: out, reread } = await rereadUncertainFields(before, OCR, createLlmClient({ groqApiKey: "k", fetch: neverCalled }));
  assert.deepEqual(out, before);
  assert.deepEqual(reread, []);
});
