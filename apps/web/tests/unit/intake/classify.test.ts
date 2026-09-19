import assert from "node:assert/strict";
import test from "node:test";
import { classify, classifyByLlm, classifyByRules } from "../../../modules/intake/classify";

const cases = [
  ["export 20 tonnes of dried apricots by train", "306"],
  ["move fresh tomatoes out of Uzbekistan by train", "325"],
  ["import tea into Uzbekistan by train", "477"],
  ["export tea by air", "540"],
  ["export tea by train", "868"],
] as const;

test("classifies a query for every published procedure", () => {
  for (const [query, expected] of cases) {
    assert.equal(classifyByRules(query).procedureId, expected, query);
  }
});

test("general procedure questions are not classified as shipments", async () => {
  const result = await classify("What documents are needed for export?");
  assert.equal(result.status, "declined");
  assert.equal(result.procedureId, null);
});

test("uses the model to understand the shipment route and quantity", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      procedureId: "325",
      confidence: 0.97,
      reason: "Fresh produce export by rail.",
      shipment: {
        goods: "fresh tomatoes",
        quantity: 20,
        unit: "tonnes",
        origin: "Andijan, Uzbekistan",
        destination: "Almaty, Kazakhstan",
        mode: "train",
      },
    }) } }],
  }));

  try {
    const result = await classifyByLlm(
      "Move twenty tonnes of tomatoes from our Andijan depot into Almaty using rail",
      "test-key",
    );
    assert.deepEqual(result?.shipmentFacts, {
      goods: "fresh tomatoes",
      quantity: 20,
      unit: "tonnes",
      origin: "Andijan, Uzbekistan",
      destination: "Almaty, Kazakhstan",
      mode: "train",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
