import assert from "node:assert/strict";
import test from "node:test";
import { createLlmClient } from "../../../modules/ai/llm";
import { routeByRules, routeMessage, type RouteContext } from "../../../modules/assistant/router";
import { converse } from "../../../modules/intake/conversation";
import { parseDraft } from "../../../modules/intake/draft";

const empty = parseDraft(null);
const CASES = [
  { id: "UZ-2609-0001", title: "Export of tea by train", status: "active" },
  { id: "UZ-2609-0002", title: "Export of dried fruits by train", status: "complete" },
];
const fresh: RouteContext = { draft: empty, expecting: null, cases: CASES };

const model = (decision: object, calls: string[] = []) =>
  createLlmClient({
    groqApiKey: "k",
    fetch: (async (_url: string, init: RequestInit) => {
      calls.push(String(init.body));
      return new Response(JSON.stringify({ model: "router-model", choices: [{ message: { content: JSON.stringify(decision) } }] }));
    }) as unknown as typeof fetch,
  });

test("rules: the trader's own cases, the procedures, a shipment and small talk are told apart", () => {
  const cases = routeByRules("What shipments are currently active?", fresh);
  assert.equal(cases.intent, "cases");
  assert.equal(cases.filter, "active");

  assert.equal(routeByRules("Which shipments are supported?", fresh).intent, "knowledge");
  assert.equal(routeByRules("What documents do I need to export tea by train?", fresh).intent, "knowledge");
  assert.equal(routeByRules("How far along is my tea shipment?", fresh).intent, "cases");
  assert.equal(routeByRules("Show me finished cases", fresh).filter, "complete");
  assert.equal(routeByRules("I want to export 20 tonnes of tea to Almaty", fresh).intent, "shipment");
  assert.equal(routeByRules("dried apricots", fresh).intent, "shipment");
  assert.equal(routeByRules("I want to move my tea to Almaty", fresh).intent, "shipment");
  assert.equal(routeByRules("hello there", fresh).intent, "other");
});

test("a case reference is settled without a model and must be a real case", async () => {
  const calls: string[] = [];
  const routed = await routeMessage("what is uz-2609-0001 waiting on?", fresh, model({ reasoning: "x", intent: "other" }, calls));
  assert.equal(routed.intent, "cases");
  assert.deepEqual(routed.caseIds, ["UZ-2609-0001"]);
  assert.equal(routed.by, "rules");
  assert.equal(calls.length, 0);
});

test("mid-intake: a plain answer goes to intake, a question is reasoned about", async () => {
  const asking = converse(empty, "I want to export tea");
  const context: RouteContext = { draft: asking.draft, expecting: asking.slot ?? null, cases: CASES };
  assert.ok(context.expecting, "intake is waiting on a detail");

  const calls: string[] = [];
  const reply = asking.slot === "mode" ? "by train" : "20 tonnes";
  const answer = await routeMessage(reply, context, model({ reasoning: "x", intent: "other" }, calls));
  assert.equal(answer.intent, "shipment");
  assert.equal(calls.length, 0);

  const question = await routeMessage(
    "What do I need for the phytosanitary certificate?",
    context,
    model({ reasoning: "A general question about a certificate.", intent: "knowledge" }, calls),
  );
  assert.equal(question.intent, "knowledge");
  assert.equal(question.by, "model");
  const sent = JSON.parse(JSON.parse(calls[0]).messages[1].content);
  assert.equal(sent.intakeInProgress, true);
  assert.ok(sent.waitingQuestion);
  assert.deepEqual(
    sent.cases.map((c: { id: string }) => c.id),
    CASES.map((c) => c.id),
  );
});

test("the model's reading decides; invented case ids are dropped", async () => {
  const routed = await routeMessage(
    "how is my tea going",
    fresh,
    model({ reasoning: "Asks about the progress of their tea case.", intent: "cases", caseIds: ["uz-2609-0001", "UZ-9999-0000"], filter: "any" }),
  );
  assert.equal(routed.intent, "cases");
  assert.deepEqual(routed.caseIds, ["UZ-2609-0001"]);
  assert.equal(routed.reasoning, "Asks about the progress of their tea case.");
  assert.equal(routed.model, "router-model");
});

test("no model, or an answer that doesn't fit: the rules route", async () => {
  assert.equal((await routeMessage("Which shipments are currently active?", fresh, undefined)).intent, "cases");
  const bad = await routeMessage("Which shipments are currently active?", fresh, model({ intent: "banana" }));
  assert.equal(bad.intent, "cases");
  assert.equal(bad.by, "rules");
});

test("wanting to move goods is a new shipment, even when a case for those goods exists", async () => {
  const calls: string[] = [];
  const withTomatoCase: RouteContext = { ...fresh, cases: [...CASES, { id: "UZ-2609-0033", title: "Export of tomatoes by train", status: "active" }] };
  const routed = await routeMessage("I want to export tomato", withTomatoCase, model({ reasoning: "Has a tomato case.", intent: "cases", caseIds: ["UZ-2609-0033"] }, calls));
  assert.equal(routed.intent, "shipment");
  assert.equal(calls.length, 0, "decided without the model");
  assert.equal((await routeMessage("How is my tomato shipment doing?", withTomatoCase, undefined)).intent, "cases");
});
