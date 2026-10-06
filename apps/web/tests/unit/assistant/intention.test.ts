import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { candidatesFor, directionOf, draftWith, ESTIMATE_QUESTION, estimateFor, goalOf } from "../../../modules/assistant/intention";
import { obviousRoute, routeByRules } from "../../../modules/assistant/router";
import { say } from "../../../modules/assistant/say";
import { EMPTY_DRAFT } from "../../../modules/intake/draft";
import { correctTypos } from "../../../modules/intake/typos";
import { mentionedRoute } from "../../../modules/intake/shipment-plan";
import { entityName, entityType, mockEntities } from "../../../modules/catalog/seed";
import { commodityOf } from "../../../modules/intake/taxonomy";

const context = { draft: EMPTY_DRAFT, expecting: null, cases: [] };

/* ------------------------------------------------------------ intention --- */

test("someone finding out is told apart from someone starting", () => {
  assert.equal(goalOf("i wanna move tea?", EMPTY_DRAFT, null), "explore");
  assert.equal(goalOf("I'm planning to export dried apricots", EMPTY_DRAFT, null), "explore");
  assert.equal(goalOf("export 20 tonnes of tea from Tashkent to Almaty by train", EMPTY_DRAFT, null), "start", "every detail at once goes to the summary");
  assert.equal(goalOf("start a shipment of tea", EMPTY_DRAFT, null), "start", "asked to start in so many words");
  assert.equal(goalOf("20 tonnes", draftWith(EMPTY_DRAFT, "export tea"), "quantity"), "start", "an answer mid-conversation is intake's");
});

test("a time question about goods is an estimate, however it is phrased", () => {
  for (const q of [
    "how long will it take to move tea by train?",
    "i want to move tea by train from Tashkent to Almaty? how much it will take",
    "what's the timeline to export carpets",
    "when will the goods arrive in Almaty",
    "how quickly can I import medicines",
  ]) {
    assert.ok(ESTIMATE_QUESTION.test(q), q);
  }
  assert.equal(goalOf("how long will it take to move tea by train?", EMPTY_DRAFT, null), "estimate");
  assert.equal(ESTIMATE_QUESTION.test("I want to take delivery of cargo"), false);
});

test("one foreign end is enough to say which way the goods go", () => {
  assert.equal(directionOf(draftWith(EMPTY_DRAFT, "cheese coming from Almaty")), "import");
  assert.equal(directionOf(draftWith(EMPTY_DRAFT, "cotton yarn to Turkey")), "export");
  assert.equal(directionOf(draftWith(EMPTY_DRAFT, "tea")), null);
});

test("candidates are the published ways, narrowed by what was said", () => {
  const tea = candidatesFor(draftWith(EMPTY_DRAFT, "tea"));
  assert.ok(tea.length >= 5, "tea is exported by train and air and imported by road, train and air");
  assert.ok(tea.every((p) => p.regime === "standard"), "moving means the whole export or import");
  const clearance = candidatesFor(draftWith(EMPTY_DRAFT, "import pasta by road"), "customs clearance of pasta");
  assert.deepEqual(clearance.map((p) => p.id), ["1007"]);
});

test("an estimate gives the published time, the agents' time and the journey - and offers nothing to open", async () => {
  const e = await estimateFor("how long will it take to move tea by train from Tashkent to Almaty?");
  assert.ok(e);
  assert.equal(e.options[0].procedureId, "868");
  assert.equal(e.from, "Tashkent");
  assert.equal(e.to, "Almaty");
  assert.ok(e.options[0].doorToDoor, "both ends known, so door to door");
  const spoken = say({ kind: "estimate", estimate: e });
  assert.match(spoken.text, /3–10 days end to end/);
  assert.match(spoken.text, /door to door/);
  assert.doesNotMatch(spoken.text, /Shall I open/);
  assert.equal(spoken.actions.confirm, undefined);
});

test("a way that is not published is said to be, with the ways that are", async () => {
  const e = await estimateFor("how long to export tomatoes by air?");
  assert.ok(e?.unpublished);
  const spoken = say({ kind: "estimate", estimate: e });
  assert.match(spoken.text, /no published procedure for exporting tomatoes by air|no published procedure for tomatoes by air/);
  assert.match(spoken.text, /Export by train/);
});

/* --------------------------------------------------------------- router --- */

test("the router reads the trader's own phrasing", () => {
  assert.equal(obviousRoute("i wanna move tea?", context)?.intent, "shipment", "a trailing ? does not make it a procedure question");
  assert.equal(obviousRoute("we are thinking of importing yoghurt", context)?.intent, "shipment");
  assert.equal(obviousRoute("Can I export carpets to Kazakhstan?", context)?.intent, "shipment");
  assert.equal(obviousRoute("how long does cheese import take?", context)?.intent, "estimate");
  assert.equal(routeByRules("how long until my tea shipment is done?", context).intent, "cases", "their own shipment is a case, not an estimate");
  assert.equal(routeByRules("how do I get a phytosanitary certificate for tea?", context).intent, "knowledge");
  assert.equal(routeByRules("what's the weather in Tashkent tomorrow?", context).intent, "other");
});

/* ---------------------------------------------------------------- typos --- */

test("misspelt goods, places and modes are put right; ordinary words are left alone", () => {
  assert.equal(correctTypos("i want to move taea by tarain from tashkent to almaty").text, "i want to move tea by train from tashkent to almaty");
  assert.equal(correctTypos("impotr chese from almty").text, "import cheese from almaty");
  for (const fine of ["I want to export tea in the rain", "what documents do I need", "Which shipments are currently active?", "how long does cheese import take?"]) {
    assert.deepEqual(correctTypos(fine).fixes, [], fine);
  }
});

/* ---------------------------------------------------------------- route --- */

test("the \"to\" of \"to import\" is not a destination", () => {
  const { origin, destination } = mentionedRoute({ origin: null, destination: null }, "how many days to import honey from Almaty by road");
  assert.equal(origin?.name, "Almaty");
  assert.notEqual(destination?.name, "Almaty");
});

test("cargo by rail is the rail service for any cargo", () => {
  const hit = commodityOf("I want to send 2 wagons of cargo by rail");
  assert.equal(hit.kind === "known" && hit.category, "any cargo");
});

/* ---------------------------------------------------------- master data --- */

test("every entity the procedures name gets its hand-checked type, once", () => {
  const gold = (JSON.parse(readFileSync("evals/gold/entities.json", "utf8")) as { entities: Record<string, string> }).entities;
  const seeded = mockEntities();
  assert.equal(new Set(seeded.map((e) => e.id)).size, seeded.length, "no two spellings of one entity");
  for (const e of seeded) assert.equal(entityType(e.canonicalName), gold[e.canonicalName], e.canonicalName);
  assert.equal(entityName("“Uzbekexpertiza” JSC"), '"Uzbekexpertiza" JSC');
});
