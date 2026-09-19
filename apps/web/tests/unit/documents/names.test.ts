import assert from "node:assert/strict";
import test from "node:test";
import { createLlmClient } from "../../../modules/ai/llm";
import type { ExtractedField } from "../../../modules/documents/docai/compose";
import { adjudicateNames, compareCompanies, partyChecks } from "../../../modules/documents/docai/names";

const field = (key: string, value: string): ExtractedField => ({ key, label: key, kind: "text", required: true, value, normalized: value, confidence: 0.9, status: "accepted", source: "test", alternatives: [] });

test("transliteration, spelling variants and legal forms don't make a mismatch", () => {
  assert.equal(compareCompanies("ООО «Шёлковый путь»", "Shelkovyy Put LLC").status, "ok");
  assert.equal(compareCompanies("MChJ “Samarqand Agro Export”", "Samarkand Agro Export LLC").status, "ok");
  assert.equal(compareCompanies("Silk Road Tea LLC, 12 Navoi st., Tashkent", "SILK ROAD TEA").status, "ok", "the address is not the name");
  assert.equal(compareCompanies("Silk Road Tea LLC", "Golden Leaf Trading Ltd").status, "mismatch");
  assert.equal(compareCompanies("Silk Road LLC", "ООО Шёлковый путь").status, "unknown", "a translated name is for someone who can read it");
});

test("the seller and buyer are compared with every earlier document that names them", () => {
  const checks = partyChecks(
    [field("seller", "Silk Road Tea LLC, Tashkent"), field("buyer", "Xinjiang Tea Import Co.")],
    [{ docType: "trade_contract", label: "Foreign trade contract", fields: [field("seller", "ООО «Silk Road Tea»"), field("buyer", "Urumqi Fresh Ltd")] }],
  );
  assert.deepEqual(checks.map((c) => [c.check, c.status]), [
    ["Seller / exporter vs Foreign trade contract", "ok"],
    ["Buyer / consignee vs Foreign trade contract", "mismatch"],
  ]);
});

test("only a local model settles the names the rules couldn't", async () => {
  const unsure = partyChecks([field("seller", "Silk Road LLC")], [{ docType: "trade_contract", label: "Foreign trade contract", fields: [field("seller", "ООО Шёлковый путь")] }]);
  assert.equal(unsure[0].status, "unknown");

  const neverCalled = (async () => assert.fail("company names must not go to Groq")) as unknown as typeof fetch;
  assert.deepEqual(await adjudicateNames(unsure, createLlmClient({ groqApiKey: "k", fetch: neverCalled })), unsure);

  const local = createLlmClient({
    localUrl: "http://127.0.0.1:11434/v1",
    fetch: (async () => new Response(JSON.stringify({ model: "qwen", choices: [{ message: { content: '{"same":"yes","reason":"Шёлковый путь is Russian for Silk Road"}' } }] }))) as unknown as typeof fetch,
  });
  const settled = await adjudicateNames(unsure, local);
  assert.equal(settled[0].status, "ok");
  assert.match(settled[0].detail, /local model \(qwen\): same company/);
});
