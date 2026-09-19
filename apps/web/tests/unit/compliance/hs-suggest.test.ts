import assert from "node:assert/strict";
import test from "node:test";
import { createLlmClient } from "../../../modules/ai/llm";
import { packingKg, rankCandidates, suggestHsCodes } from "../../../modules/compliance/hs-suggest";

function model(answer: object) {
  const prompts: string[] = [];
  const fetch = (async (_url: string, init?: RequestInit) => {
    prompts.push(String(JSON.parse(String(init?.body)).messages[1].content));
    return new Response(JSON.stringify({ model: "test-model", choices: [{ message: { content: JSON.stringify(answer) } }] }));
  }) as unknown as typeof globalThis.fetch;
  return { prompts, fetch };
}

test("rules rank the subheadings of the heading intake knows, by what the goods say", async () => {
  assert.equal(packingKg("black tea in 100 g packets"), 0.1);
  assert.equal(packingKg("green tea, 25 kg bags"), 25);

  const packed = await suggestHsCodes({ heading: "0902", goods: "black tea in 100 g packets", documentText: null, digits: 10 });
  assert.equal(packed[0].code, "0902300000");
  assert.equal(packed[0].by, "rules");
  assert.match(packed[0].reason, /0000 assumed/);

  assert.equal(rankCandidates("0902", "green tea, 25 kg bags")[0].entry.code, "090220");
  assert.equal(rankCandidates("0806.20", "raisins")[0].entry.code, "080620");
  assert.equal((await suggestHsCodes({ heading: "0902", goods: "tea", documentText: null, digits: 6 })).length, 3);
  assert.deepEqual(await suggestHsCodes({ heading: null, goods: "tea", documentText: null, digits: 6 }), []);
});

test("a model only re-ranks the candidates, and sees document text only if it is local", async () => {
  const answer = { ranked: [{ code: "999999", reason: "made up" }, { code: "090240", reason: "Bulk black tea" }] };
  const groq = model(answer);
  const ranked = await suggestHsCodes({ heading: "0902", goods: "black tea", documentText: "Black tea, 50 kg sacks", digits: 6, llm: createLlmClient({ groqApiKey: "k", fetch: groq.fetch }) });
  assert.deepEqual(ranked.map((s) => [s.code, s.by]), [["090240", "model"]], "the invented code is dropped");
  assert.ok(!groq.prompts[0].includes("sacks"), "the invoice description didn't go to Groq");

  const local = model(answer);
  await suggestHsCodes({ heading: "0902", goods: "black tea", documentText: "Black tea, 50 kg sacks", digits: 6, llm: createLlmClient({ localUrl: "http://127.0.0.1:11434/v1", fetch: local.fetch }) });
  assert.ok(local.prompts[0].includes("sacks"), "a local model reads it");
});
