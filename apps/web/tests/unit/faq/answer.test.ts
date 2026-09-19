import assert from "node:assert/strict";
import test from "node:test";
import { createLlmClient } from "../../../modules/ai/llm";
import { answerQuestion, retrieve, retrieveWithFaq, unsupportedClaims } from "../../../modules/faq/answer";

const QUESTION = "Where do I apply for the phytosanitary certificate when exporting dried fruits?";

const model = (answer: object) =>
  createLlmClient({
    groqApiKey: "k",
    fetch: (async () => new Response(JSON.stringify({ model: "test-model", choices: [{ message: { content: JSON.stringify(answer) } }] }))) as unknown as typeof fetch,
  });

test("retrieval finds the procedure steps that answer the question", () => {
  const hits = retrieve(QUESTION, 8);
  assert.ok(hits.length > 0);
  assert.ok(
    hits.some((h) => h.passage.id.startsWith("step:306:") && /phytosanitary/i.test(h.passage.title)),
    hits.map((h) => h.passage.title).join("\n"),
  );
  assert.equal(retrieve("zzqx qqzz").length, 0);
});

test("a model's answer keeps only valid citations, renumbered to its sources", async () => {
  const hits = retrieve(QUESTION, 8);
  const answer = await answerQuestion(QUESTION, model({ found: true, answer: "Apply online through the Single Window [3], after the internal certificate [1] and [42].", citations: [3, 1, 42] }));
  assert.equal(answer.found, true);
  assert.equal(answer.by, "model");
  assert.deepEqual(answer.sources.map((s) => s.id), [hits[2].passage.id, hits[0].passage.id]);
  assert.equal(answer.answer, "Apply online through the Single Window [1], after the internal certificate [2] and.");
});

test("an answer that states what its sources don't is withheld, and says why", async () => {
  const invented = await answerQuestion(QUESTION, model({ found: true, answer: "Apply at agro.gov.uz within 3 days [1].", citations: [1] }));
  assert.equal(invented.found, false);
  assert.equal(invented.answer, null);
  assert.match(invented.withheld ?? "", /agro\.gov\.uz/);
  assert.match(invented.withheld ?? "", /“3”/, "a number only counts as supported when the passage has that number, not 38");

  const inline = await answerQuestion(QUESTION, model({ found: true, answer: "Apply online through the Single Window [1].", citations: [] }));
  assert.equal(inline.found, true, "a [n] marker in the text is a citation");
});

test("no citation, not found, or no model: no answer - only the closest passages", async () => {
  const uncited = await answerQuestion(QUESTION, model({ found: true, answer: "Yes.", citations: [] }));
  assert.equal(uncited.found, false);
  assert.equal(uncited.answer, null);
  assert.match(uncited.withheld ?? "", /cited no passage/);
  assert.ok(uncited.sources.length > 0);

  assert.equal((await answerQuestion(QUESTION, model({ found: false, answer: null, citations: [] }))).found, false);

  const plain = await answerQuestion(QUESTION);
  assert.equal(plain.by, "retrieval");
  assert.equal(plain.answer, null);
  assert.ok(plain.sources.length > 0);
});

test("a list of step numbers is checked number by number", () => {
  const cited = [{ id: "x", title: "Steps", text: "Steps 4, 5 and 8 apply; 1,500 kg.", href: null }];
  assert.deepEqual(unsupportedClaims("Do steps 4,5,8 [1].", cited), []);
  assert.deepEqual(unsupportedClaims("Do steps 4,5,9 [1].", cited), ["4,5,9"]);
  assert.deepEqual(unsupportedClaims("Up to 2,500 kg [1].", cited), ["2,500"], "a thousands figure is one number");
});

test("a question about what is covered is answered from the list of every procedure", async () => {
  const [first] = retrieveWithFaq("What goods can I move?");
  assert.equal(first.passage.id, "faq:supported");
  assert.match(first.passage.text, /juices/);
  assert.match(first.passage.text, /fertilizers/);
  assert.notEqual(retrieveWithFaq(QUESTION)[0].passage.id, "faq:supported", "other questions keep plain search");
});
