import assert from "node:assert/strict";
import test from "node:test";
import { classifyByRules, settleMatch } from "../../../modules/intake/classify";
import { namedPlace, routeGap, withPlace } from "../../../modules/intake/coverage";

const settle = (q: string) => settleMatch(classifyByRules(q), q);

test("a place master data does not know is declined, not planned without it", () => {
  const m = settle("export 20 tonnes of cherries from Tashkent to Frankfurt by train");
  assert.equal(m.status, "declined");
  assert.equal(m.procedureId, null);
  assert.match(m.reason, /Frankfurt/);
  assert.match(m.reason, /No route data/);
});

test("the covered countries are offered, and picking one re-runs the same sentence", () => {
  const m = settle("export 20 tonnes of cherries from Tashkent to Frankfurt by train");
  const germany = m.clarify?.options.find((o) => o.label === "Germany");
  assert.ok(germany, "Germany is in the corridor table, so it must be offered");
  assert.equal(germany.query, "export 20 tonnes of cherries from Tashkent to Germany by train");
  // The suggestion has to actually work when it comes back round.
  assert.equal(settle(germany.query).procedureId, "325");
  // A country with no corridor is never suggested for a train.
  assert.ok(!m.clarify?.options.some((o) => o.label === "Ukraine" || o.label === "United Kingdom"));
});

test("a known city whose country has no surface corridor is declined too", () => {
  const m = settle("export 20 tonnes of cherries from Tashkent to Kyiv by train");
  assert.equal(m.status, "declined");
  assert.equal(m.procedureId, null);
  assert.match(m.reason, /no train corridor to Ukraine/);
  assert.match(m.reason, /air/);
});

test("air needs no corridor, so an air leg to the same city is not a route gap", () => {
  assert.equal(routeGap({ origin: "Tashkent", destination: "Kyiv" }, "air"), null);
  assert.ok(routeGap({ origin: "Tashkent", destination: "Kyiv" }, "train"));
  // Before the mode is known the clarify flow asks for it; no corridor claim yet.
  assert.equal(routeGap({ origin: "Tashkent", destination: "Kyiv" }, null), null);
});

test("routes master data does have are untouched", () => {
  assert.equal(settle("export 20 tonnes of cherries from Tashkent to Almaty by train").procedureId, "325");
  assert.equal(settle("export 20 tonnes of cherries from Tashkent to Germany by train").procedureId, "325");
  assert.equal(settle("export 20 tonnes of cherries by train").procedureId, "325");
});

test("vague wording is not a coverage gap", () => {
  assert.equal(settle("export 20 tonnes of cherries from the warehouse to the port by train").procedureId, "325");
  assert.equal(namedPlace("the warehouse"), null);
  assert.equal(namedPlace("our supplier"), null);
  assert.equal(namedPlace(null), null);
});

test("the place is read out of whatever the trader wrote around it", () => {
  assert.equal(namedPlace("Frankfurt next month"), "Frankfurt");
  assert.equal(namedPlace("Bandar Abbas"), "Bandar Abbas");
  assert.equal(namedPlace("frankfurt"), "frankfurt");
});

test("a place that cannot be found in the sentence is appended instead of lost", () => {
  assert.equal(withPlace("export cherries by train.", "Frankfurt", "Germany"), "export cherries by train — to Germany");
  assert.equal(withPlace("to FRANKFURT by air", "Frankfurt", "Germany"), "to Germany by air");
});
