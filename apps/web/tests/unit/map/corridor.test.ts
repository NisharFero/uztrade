import assert from "node:assert/strict";
import test from "node:test";
import { anchorPoints, bearingAt, cargoGlyphFor, cargoOf, corridorOf, inspectionsOf, placementFor, pointAt, unitGlyph, GLYPH } from "../../../modules/map/corridor";
import { findPlace, planRoute, type Route } from "../../../modules/intake/shipment-plan";

const end = (name: string) => ({ place: findPlace(name)!, assumed: false });

/** geoInterpolate is a spherical interpolator: at t=1 it returns the end point
 *  to about 14 decimal places, not bit-identically, so endpoints are compared
 *  with a tolerance far below any pixel. */
const samePoint = (a: readonly number[], b: readonly number[], what: string) => {
  assert.ok(
    Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9,
    `${what}: ${JSON.stringify(a)} is not ${JSON.stringify(b)}`,
  );
};
const route = (from: string, to: string, mode: "train" | "road" | "air" = "train"): Route =>
  planRoute(mode, end(from), end(to), "export");

test("the chain runs origin, every via country's hub, destination", () => {
  const c = corridorOf(route("Tashkent", "Moscow"))!;
  // RAIL_CORRIDORS puts Russia via Kazakhstan, whose hub is Almaty.
  assert.deepEqual(c.waypoints.map((w) => w.country), ["UZ", "KZ", "RU"]);
  assert.match(c.waypoints[1].name, /Almaty · Kazakhstan/);
  assert.equal(c.segments.length, 2);
  assert.equal(Math.round(c.segments.reduce((a, s) => a + s.share, 0) * 1000) / 1000, 1);
  assert.deepEqual([c.marks[0], c.marks[c.marks.length - 1]], [0, 1]);
});

test("every country change is a border, and each gets a fraction", () => {
  const viaKz = corridorOf(route("Tashkent", "Moscow"))!;
  assert.deepEqual(viaKz.segments.map((s) => s.border), [true, true]);
  assert.equal(viaKz.borders.length, 2);
  for (const b of viaKz.borders) assert.ok(b > 0 && b < 1, `border fraction ${b} must be inside the corridor`);

  const direct = corridorOf(route("Tashkent", "Almaty"))!;
  assert.equal(direct.segments.length, 1);
  assert.deepEqual(direct.borders, [0.5], "a direct crossing sits at the midpoint");
});

test("paperwork does not move the cargo: everything up to loaded sits at the origin", () => {
  const c = corridorOf(route("Tashkent", "Moscow"))!;
  const origin = c.waypoints[0].at;
  for (const m of ["planned", "capacity_requested", "capacity_confirmed", "cargo_ready", "loaded"] as const) {
    const p = placementFor(c, m);
    assert.deepEqual(p.at, origin, `${m} must stay at the origin`);
    assert.equal(p.fraction, 0);
    assert.equal(p.moving, false);
  }
});

test("the moving milestones advance in order and arrival lands on the destination", () => {
  const c = corridorOf(route("Tashkent", "Moscow"))!;
  const f = (m: Parameters<typeof placementFor>[1]) => placementFor(c, m).fraction;
  assert.ok(f("loaded") < f("dispatched"), "departing moves it off the origin");
  assert.ok(f("dispatched") < f("at_border"), "the border is ahead of departure");
  assert.ok(f("at_border") < f("cleared"), "release is past the border");
  assert.ok(f("cleared") < f("arrived"));
  assert.equal(f("arrived"), 1);
  samePoint(placementFor(c, "arrived").at, c.waypoints[c.waypoints.length - 1].at, "arrived");
  assert.equal(placementFor(c, "at_border").moving, false);
  assert.equal(placementFor(c, "dispatched").moving, true);
});

test("at_border snaps to a border the corridor actually names", () => {
  const c = corridorOf(route("Tashkent", "Moscow"))!;
  assert.equal(placementFor(c, "at_border").fraction, c.borders[0]);
});

test("a point on the corridor is always on one of its own segments", () => {
  const c = corridorOf(route("Tashkent", "Berlin"))!;
  for (const f of [0, 0.01, 0.25, 0.5, 0.75, 0.99, 1]) {
    const { at, segment } = pointAt(c, f);
    assert.ok(segment, `fraction ${f} must land on a segment`);
    assert.ok(Number.isFinite(at[0]) && Number.isFinite(at[1]), `fraction ${f} must give real coordinates`);
    assert.ok(at[0] >= -180 && at[0] <= 180 && at[1] >= -90 && at[1] <= 90, `fraction ${f} must be on the globe`);
  }
  samePoint(pointAt(c, -5).at, c.waypoints[0].at, "a negative fraction clamps to the origin");
  samePoint(pointAt(c, 5).at, c.waypoints[c.waypoints.length - 1].at, "an over-range fraction clamps to the end");
});

test("a declared sea leg is carried by ship, and says so", () => {
  // Georgia is reached over the Caspian: RAIL_CORRIDORS declares the ferry.
  // Which leg it lands on is asserted separately — this one only checks that
  // a declared crossing produces exactly one ship leg.
  const c = corridorOf(route("Tashkent", "Tbilisi"))!;
  assert.ok(c.notes.sea, "the corridor declares a sea leg");
  assert.match(c.notes.sea, /Caspian/);
  assert.equal(c.segments.filter((s) => s.kind === "sea").length, 1);
  assert.equal(GLYPH.sea, "ship");
});

test("road and air corridors take their own glyph", () => {
  assert.equal(corridorOf(route("Tashkent", "Almaty", "road"))!.segments[0].kind, "road");
  assert.equal(corridorOf(route("Tashkent", "Almaty", "air"))!.segments[0].kind, "air");
  assert.equal(GLYPH.road, "truck");
  assert.equal(GLYPH.air, "plane");
});

test("a glyph faces the way it is going", () => {
  const east = corridorOf(route("Tashkent", "Almaty"))!;
  const b = bearingAt(east, 0.5);
  // Almaty is east and slightly north of Tashkent: roughly a quarter turn.
  assert.ok(b > 45 && b < 115, `expected an easterly bearing, got ${Math.round(b)}`);

  const west = corridorOf(route("Tashkent", "Berlin"))!;
  const w = bearingAt(west, 0.9);
  assert.ok(w > 230 && w < 330, `the Berlin approach should run west, got ${Math.round(w)}`);

  for (const f of [0, 0.5, 1]) {
    const v = bearingAt(west, f);
    assert.ok(Number.isFinite(v) && v >= 0 && v < 360, `bearing at ${f} must be a compass value, got ${v}`);
  }
});

test("the cargo unit glyph follows the planner's own wording", () => {
  assert.equal(unitGlyph("covered wagon"), "wagon");
  assert.equal(unitGlyph("refrigerated wagon"), "wagon");
  assert.equal(unitGlyph("truck"), "truck");
  assert.equal(unitGlyph("refrigerated truck"), "truck");
  assert.equal(unitGlyph("air pallet"), "pallet");
  assert.equal(unitGlyph("refrigerated air pallet"), "pallet");
  // The planner yields no container unit, so anything unrecognised is a crate.
  assert.equal(unitGlyph("something else"), "crate");
});

test("a declared container case is shown as containers, not as wagons", () => {
  // Intake really does extract this: "3 containers of tea" sets unit=containers.
  const c = cargoOf({ quantity: 3, unit: "containers" }, { kind: "covered wagon", count: 1 });
  assert.deepEqual([c.glyph, c.count, c.label, c.source], ["container", 3, "3 × container", "declared"]);

  const w = cargoOf({ quantity: 4, unit: "wagons" }, { kind: "covered wagon", count: 2 });
  assert.deepEqual([w.glyph, w.count, w.source], ["wagon", 4, "declared"]);
});

test("a weight declaration falls back to the transport unit the planner derived", () => {
  const t = cargoOf({ quantity: 20, unit: "tonnes" }, { kind: "refrigerated wagon", count: 2 });
  assert.deepEqual([t.glyph, t.count, t.label, t.source], ["wagon", 2, "2 × refrigerated wagon", "planned"]);
  // Nothing declared at all behaves the same way.
  assert.equal(cargoOf({ quantity: null, unit: null }, { kind: "truck", count: 3 }).source, "planned");
});

test("every unit intake can extract maps to a glyph", () => {
  for (const [unit, glyph] of [
    ["containers", "container"], ["container", "container"],
    ["wagons", "wagon"], ["railcars", "wagon"],
    ["trucks", "truck"], ["lorries", "truck"], ["furas", "truck"],
    ["tonnes", "weight"], ["kg", "weight"], ["mt", "weight"],
    ["cases", "crate"], ["boxes", "crate"], ["pallets", "pallet"],
  ] as const) {
    assert.equal(cargoGlyphFor(unit), glyph, `${unit} should be ${glyph}`);
  }
  assert.equal(cargoGlyphFor(null), null);
  assert.equal(cargoGlyphFor("bananas"), null, "a word that is not a unit is not a glyph");
});

test("a physical step is anchored where its own wording puts it", () => {
  const steps = [
    { num: 14, title: "Undergo phytosanitary inspection", where: "Warehouse / Location of goods", entity: "", lane: "physical" },
    { num: 17, title: "Undergo fumigation", where: "Fumigation (disinfection) division", entity: "", lane: "physical" },
    { num: 25, title: "Loading", where: "Place of loading / branch line", entity: "", lane: "physical" },
    { num: 30, title: "Undergo phytosanitary inspection", where: "Office of the inspector on the border checkpoint", entity: "", lane: "physical" },
    { num: 48, title: "Dispatch freight", where: "Commodity cash desk", entity: "", lane: "physical" },
    { num: 52, title: "Unloading", where: "Destination warehouse", entity: "", lane: "physical" },
    { num: 9, title: "Register the contract", where: "Single window", entity: "", lane: "agent" },
  ];
  const got = inspectionsOf(steps);
  assert.equal(got.length, 6, "only the physical steps are places a person must be");
  assert.equal(got.find((i) => i.stepNum === 30)?.anchor, "border", "a border checkpoint is at the border");
  assert.equal(got.find((i) => i.stepNum === 14)?.anchor, "origin", "a pre-shipment check is at the origin");
  assert.equal(got.find((i) => i.stepNum === 52)?.anchor, "destination", "after dispatch it is the far end");
  assert.deepEqual(got.map((i) => i.stepNum), [14, 17, 25, 30, 48, 52], "kept in step order");
  // The facility is quoted from the procedure, never invented.
  assert.equal(got.find((i) => i.stepNum === 17)?.where, "Fumigation (disinfection) division");
});

test("every anchor lands on the corridor", () => {
  const c = corridorOf(route("Tashkent", "Moscow"))!;
  const a = anchorPoints(c);
  samePoint(a.origin, c.waypoints[0].at, "origin anchor");
  samePoint(a.destination, c.waypoints[c.waypoints.length - 1].at, "destination anchor");
  const onBorder = pointAt(c, c.borders[0]).at;
  samePoint(a.border, onBorder, "border anchor");
});

test("a ferry is drawn on the leg that actually crosses the water", () => {
  // Georgia is reached Turkmenbashi -> Baku, which is not the final approach.
  // Assuming the note always described the last leg drew a railway across the
  // Caspian and a ferry overland from Baku to Tbilisi.
  const c = corridorOf(route("Tashkent", "Tbilisi"))!;
  assert.match(c.notes.sea!, /Turkmenbashi/);
  const sea = c.segments.filter((s) => s.kind === "sea");
  assert.equal(sea.length, 1, "exactly one leg crosses the water");
  assert.equal(`${sea[0].from.country}->${sea[0].to.country}`, "TM->AZ");
  // Nothing after the crossing is still at sea.
  assert.equal(c.segments[c.segments.length - 1].kind, "rail", "Baku to Tbilisi is overland");
});

test("corridors whose crossing IS the last leg are unchanged", () => {
  for (const [dest, expected] of [
    ["Dubai", "IR->AE:sea"],
    ["Mumbai", "IR->IN:sea"],
    // "from a Chinese port" names nowhere the gazetteer knows, so the last
    // leg remains the fallback.
    ["Seoul", "CN->KR:sea"],
  ] as const) {
    const c = corridorOf(route("Tashkent", dest))!;
    const last = c.segments[c.segments.length - 1];
    assert.equal(`${last.from.country}->${last.to.country}:${last.kind}`, expected, dest);
  }
});

test("a road leg is placed by its note too", () => {
  // "road leg from Hairatan" — Hairatan is in Afghanistan.
  const c = corridorOf(route("Tashkent", "Karachi"))!;
  assert.match(c.notes.road!, /Hairatan/);
  const road = c.segments.filter((s) => s.kind === "road");
  assert.equal(road.length, 1);
  assert.equal(`${road[0].from.country}->${road[0].to.country}`, "AF->PK");
});

test("a ferry starts at the port the note names, not at the inland hub", () => {
  // Turkmenistan's freight hub is Ashgabat, which is inland. The note says the
  // crossing is Turkmenbashi -> Baku, so the rail run to the coast has to
  // exist and the sea leg has to begin at the port.
  const c = corridorOf(route("Tashkent", "Tbilisi"))!;
  const legs = c.segments.map((s) => `${s.from.name.replace(/ · .*/, "")}→${s.to.name.replace(/ · .*/, "")}:${s.kind}`);
  assert.deepEqual(legs, [
    "Tashkent→Ashgabat:rail",
    "Ashgabat→Turkmenbashi:rail",
    "Turkmenbashi→Baku:sea",
    "Baku→Tbilisi:rail",
  ]);
});

test("a road leg starts at its named port too, without duplicating the hub", () => {
  // "road leg from Hairatan" also contains the words Afghanistan and Pakistan,
  // which resolve to those countries' hubs; taking the first match inserted
  // Mazar-i-Sharif twice and made a zero-length leg.
  const c = corridorOf(route("Tashkent", "Karachi"))!;
  const legs = c.segments.map((s) => `${s.from.name.replace(/ · .*/, "")}→${s.to.name.replace(/ · .*/, "")}:${s.kind}`);
  assert.deepEqual(legs, ["Tashkent→Mazar-i-Sharif:rail", "Mazar-i-Sharif→Hairatan:rail", "Hairatan→Karachi:road"]);
});

test("no corridor ever contains a zero-length leg", () => {
  for (const dest of ["Tbilisi", "Karachi", "Dubai", "Mumbai", "Seoul", "Moscow", "Almaty", "Berlin", "Istanbul"]) {
    const c = corridorOf(route("Tashkent", dest))!;
    for (const [i, s] of c.segments.entries()) {
      assert.ok(s.share > 0.0001, `${dest} leg ${i} (${s.from.name}→${s.to.name}) has no length`);
      assert.ok(s.from.at[0] !== s.to.at[0] || s.from.at[1] !== s.to.at[1], `${dest} leg ${i} starts and ends in one place`);
    }
    assert.equal(Math.round(c.segments.reduce((a, s) => a + s.share, 0) * 1000) / 1000, 1, `${dest} shares must total 1`);
  }
});
