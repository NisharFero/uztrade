import assert from "node:assert/strict";
import test from "node:test";
import { handlingFor, isPerishable, wagonTonnesFor } from "../../../modules/intake/goods-handling";
import { unitsFor } from "../../../modules/intake/shipment-plan";
import { CATEGORIES } from "../../../modules/intake/taxonomy";

test("a cold chain is a cold chain whatever carries it", () => {
  for (const goods of ["dairy products", "meat and meat products", "eggs", "pharmaceutical products", "fresh fruits and vegetables"]) {
    assert.equal(isPerishable(goods), true, goods);
    assert.match(unitsFor("train", goods, 20).kind, /refrigerated wagon/);
    assert.match(unitsFor("road", goods, 20).kind, /refrigerated truck/);
    assert.match(unitsFor("air", goods, 2).kind, /refrigerated air pallet/);
  }
  for (const goods of ["tea", "carpets", "cement", "jewelry", "any cargo"]) {
    assert.equal(isPerishable(goods), false, goods);
    assert.equal(unitsFor("train", goods, 20).kind, "covered wagon");
    assert.equal(unitsFor("road", goods, 20).kind, "truck");
  }
});

test("what fills first decides the unit size, not one default for everything", () => {
  // Cement reaches the weight limit; carpets fill the space; jewelry does neither.
  assert.ok(wagonTonnesFor("cement") > wagonTonnesFor("carpets"));
  assert.ok(wagonTonnesFor("carpets") > wagonTonnesFor("jewelry"));
  // Goods nobody has characterised get the middle default, not a guess.
  assert.equal(wagonTonnesFor("something nobody listed"), 30);
  assert.deepEqual(handlingFor("something nobody listed"), { chain: "ambient", band: "standard" });
});

test("every published category plans a load without falling over", () => {
  for (const goods of CATEGORIES) {
    for (const mode of ["train", "road", "air"] as const) {
      const units = unitsFor(mode, goods, 24);
      assert.ok(units.count >= 1, `${goods} by ${mode}`);
      assert.ok(units.perUnitT > 0, `${goods} by ${mode}`);
      assert.ok(units.kind.length > 0, `${goods} by ${mode}`);
    }
  }
});
