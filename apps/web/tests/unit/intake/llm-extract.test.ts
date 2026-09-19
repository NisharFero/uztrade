import assert from "node:assert/strict";
import test from "node:test";
import { createLlmClient } from "../../../modules/ai/llm";
import { converse } from "../../../modules/intake/conversation";
import { EMPTY_DRAFT } from "../../../modules/intake/draft";
import { needsModel, restate, understandWithModel } from "../../../modules/intake/llm-extract";

const model = (answer: object) =>
  createLlmClient({
    groqApiKey: "k",
    fetch: (async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))) as unknown as typeof fetch,
  });

test("a Russian message is read into slots, restated, and decided by the rules", async () => {
  const message = "вывозим 20 тонн чая из Ташкента в Алматы поездом";
  assert.ok(needsModel(message, true, false), "Cyrillic goes to the model even when the rules caught a number");
  const read = await understandWithModel(
    message,
    null,
    model({ shipment: true, goods: "tea", direction: "export", mode: "train", quantity: 20, unit: "tonnes", origin: "Tashkent", destination: "Almaty" }),
  );
  assert.equal(read?.text, "export 20 tonnes of tea from Tashkent to Almaty by train");
  const turn = converse(EMPTY_DRAFT, read!.text);
  assert.equal(turn.status, "confirm");
  assert.equal(turn.summary?.procedureId, "868");
});

test("goods and places the app doesn't know are dropped, not trusted", () => {
  assert.equal(restate({ shipment: true, goods: "unobtainium", direction: "export", origin: "Atlantis", destination: "Almaty" }, null), "export to Almaty");
  assert.equal(restate({ shipment: true, origin: "Tashkent" }, "route"), "Tashkent", "a bare place answering the route question stays bare");
  assert.equal(restate({ shipment: true, quantity: 3, unit: "wagons" }, "quantity"), "3 wagons");
});

test("trucks are a unit the rules measure; a unit they don't is dropped", () => {
  // What Groq returned for "2 fura pomidor Andijondan Almatiga".
  const text = restate({ shipment: true, goods: "tomatoes", direction: "export", mode: "road", quantity: 2, unit: "fura", origin: "Andijan", destination: "Almaty" }, null);
  assert.equal(text, "export 2 trucks of tomatoes from Andijan to Almaty by road");
  assert.equal(restate({ shipment: true, goods: "tea", quantity: 12, unit: "pallets" }, null), "tea", "a count of pallets isn't read as tonnes");
  const turn = converse(EMPTY_DRAFT, text);
  assert.equal(turn.status, "asking");
  assert.equal(turn.slot, "mode", "tomatoes aren't published by road");
  assert.equal(restate({ shipment: true, goods: "tea", quantity: 20, unit: "тонн" }, null), "20 tonnes of tea");
});

test("without a model, or for small talk, the rules' answer stands", async () => {
  assert.equal(needsModel("export tea by train", true, false), false);
  assert.equal(needsModel("What documents are needed for export?", true, true), false);
  assert.equal(await understandWithModel("what's the weather", null, undefined), null);
  assert.equal(await understandWithModel("what's the weather", null, model({ shipment: false })), null);
});
