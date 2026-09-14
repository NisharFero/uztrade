import assert from "node:assert/strict";
import test from "node:test";
import { PROCEDURES } from "../../../modules/procedures/data/procedures.generated";
import { extractShipmentFacts } from "../../../modules/workflow/domain";
import { classifyByRules, settleMatch } from "../../../modules/intake/classify";
import { buildShipmentPlan, findPlace, resolveRoute, toTonnes } from "../../../modules/intake/shipment-plan";

test("casual quantities and either route order are understood", () => {
  const a = extractShipmentFacts("send 20t tea to Urumqi from Samarkand");
  assert.equal(a.quantity, 20);
  assert.equal(a.unit, "t");
  assert.equal(a.goods, "tea");
  assert.equal(a.origin, "Samarkand");
  assert.equal(a.destination, "Urumqi");

  assert.equal(extractShipmentFacts("export 20,000 kg of tea from Tashkent to Moscow").quantity, 20000);
  assert.equal(toTonnes(20000, "kg", "tea"), 20);
  assert.equal(toTonnes(3, "wagons", "tea"), 90);
});

test("places resolve from cities, aliases and bare country names", () => {
  assert.equal(findPlace("St. Petersburg")?.name, "Saint Petersburg");
  assert.equal(findPlace("somewhere in Russia")?.name, "Moscow");
  const route = resolveRoute("export", { origin: null, destination: null }, "export tea to Almaty");
  assert.equal(route.origin?.place.name, "Tashkent");
  assert.equal(route.origin?.assumed, true, "the Uzbek end is assumed and flagged");
  assert.equal(route.destination?.place.name, "Almaty");
});

test("quantity sizes the shipment and stretches only goods-handling blocks", () => {
  const p = PROCEDURES["868"];
  const one = buildShipmentPlan(p, extractShipmentFacts("export 20 tonnes of tea from Tashkent to Moscow"));
  const four = buildShipmentPlan(p, extractShipmentFacts("export 120 tonnes of tea from Tashkent to Moscow"));
  assert.equal(one.units.count, 1);
  assert.equal(one.adjustments.length, 0, "one wagon keeps the published durations");
  assert.equal(four.units.count, 4);
  assert.ok(four.adjustments.length > 0);
  assert.ok(four.adjustments.every((a) => a.adjusted[1] > a.published[1]));
  assert.ok(four.paperwork[1] > one.paperwork[1], "more wagons lengthen the critical path");
  assert.ok(four.adjustments.every((a) => !/dispatch/i.test(a.name)), "a train is dispatched once");
});

test("distance drives transit: farther and across more borders takes longer", () => {
  const p = PROCEDURES["868"];
  const near = buildShipmentPlan(p, extractShipmentFacts("export 20 tonnes of tea from Tashkent to Almaty"));
  const far = buildShipmentPlan(p, extractShipmentFacts("export 20 tonnes of tea from Tashkent to Moscow"));
  assert.ok(near.route && far.route);
  assert.equal(near.route.borders, 1);
  assert.equal(far.route.borders, 2);
  assert.deepEqual(far.route.via, ["KZ"]);
  assert.ok(far.route.distanceKm > near.route.distanceKm);
  assert.ok(far.route.transit[0] > near.route.transit[0]);
  assert.ok(far.doorToDoor![1] > near.doorToDoor![1]);

  const china = buildShipmentPlan(p, extractShipmentFacts("export 20 tonnes of tea from Tashkent to Urumqi"));
  assert.ok(china.route?.gaugeBreak, "the Chinese border is a break of gauge");
});

test("fresh produce on a long route is flagged; air over freighter capacity is flagged", () => {
  const produce = buildShipmentPlan(PROCEDURES["325"], extractShipmentFacts("export 20 tonnes of tomatoes from Tashkent to Dubai by train"));
  assert.ok(produce.notes.some((n) => n.tone === "high" && /shelf life/.test(n.text)));
  const air = buildShipmentPlan(PROCEDURES["540"], extractShipmentFacts("export 150 tonnes of tea from Tashkent to Dubai by air"));
  assert.ok(air.notes.some((n) => n.tone === "high" && /freighter/.test(n.text)));
});

test("with no mode stated, the load picks train or air; a stated mode is kept", () => {
  const pick = (q: string) => settleMatch(classifyByRules(q), q).procedureId;
  assert.equal(pick("export 60 tonnes of tea from Tashkent to Moscow"), "868");
  assert.equal(pick("export 500 kg of tea from Tashkent to Dubai"), "540");
  assert.equal(pick("export 500 kg of tea from Tashkent to Moscow by train"), "868");
  assert.equal(pick("export 60 tonnes of tea to Dubai by air"), "540");
});
