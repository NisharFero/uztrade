import assert from "node:assert/strict";
import test from "node:test";
import { converse, type IntakeTurn } from "../../../modules/intake/conversation";
import { EMPTY_DRAFT } from "../../../modules/intake/draft";

/** Plays a conversation: each reply is read against the slot just asked. */
function talk(...replies: string[]): IntakeTurn {
  let turn = converse(EMPTY_DRAFT, replies[0]);
  for (const reply of replies.slice(1)) turn = converse(turn.draft, reply, { expecting: turn.slot ?? null });
  return turn;
}

test("'I want to move tea' asks export or import first, then the modes published for that direction", () => {
  const first = talk("I want to move tea");
  assert.equal(first.slot, "direction");
  assert.deepEqual(first.options.map((o) => o.reply), ["export", "import"]);
  assert.equal(first.progress[1].label, "Export / Import");

  const exporting = converse(first.draft, "export", { expecting: "direction" });
  assert.equal(exporting.slot, "mode");
  assert.deepEqual(exporting.options.map((o) => o.reply), ["by train", "by air"]);

  const importing = converse(first.draft, "import", { expecting: "direction" });
  assert.equal(importing.draft.mode, "train", "tea imports are only published by train");
  assert.equal(importing.slot, "quantity");
});

test("goods published in one direction only are stated, not asked", () => {
  const raisins = talk("raisins");
  assert.equal(raisins.draft.statedDirection, "export");
  assert.ok(raisins.notes.some((n) => /Only export/.test(n)));
  assert.equal(raisins.slot, "quantity");
});

test("a single published mode is stated, not asked; an unpublished one is refused", () => {
  const dried = talk("export raisins");
  assert.equal(dried.draft.mode, "train");
  assert.equal(dried.slot, "quantity");
  assert.ok(dried.notes.some((n) => /Only train/i.test(n)));

  const air = talk("export raisins by air");
  assert.equal(air.slot, "mode");
  assert.match(air.message, /isn't a published procedure/);
  assert.deepEqual(air.options.map((o) => o.reply), ["by train"]);
});

test("quantity is checked for reasonableness against the mode", () => {
  assert.equal(talk("tea", "export", "by train", "0 tonnes").slot, "quantity");

  const huge = talk("export tea by train", "9000 tonnes");
  assert.equal(huge.slot, "quantity");
  assert.match(huge.message, /Split/);

  const heavyAir = talk("export tea by air", "40 tonnes");
  assert.equal(heavyAir.slot, "quantity");
  assert.ok(heavyAir.options.some((o) => o.reply === "keep"));
  assert.ok(heavyAir.options.some((o) => o.reply === "by train"));
  assert.equal(converse(heavyAir.draft, "keep", { expecting: "quantity" }).slot, "route");

  const wagons = talk("export tea by train", "3 wagons");
  assert.equal(wagons.slot, "route");
  assert.ok(wagons.notes.some((n) => /90 t/.test(n)));
});

test("the route needs one end in Uzbekistan and the other in the country list", () => {
  const base = talk("export tea by train", "20 tonnes");
  assert.equal(base.slot, "route");
  assert.match(converse(base.draft, "Tashkent to Samarkand", { expecting: "route" }).message, /domestic/i);
  assert.match(converse(base.draft, "Almaty to Moscow", { expecting: "route" }).message, /Neither end/);

  const germany = converse(base.draft, "Tashkent to Berlin", { expecting: "route" });
  assert.equal(germany.slot, "route");
  assert.match(germany.message, /Germany/);

  const half = converse(base.draft, "to Almaty", { expecting: "route" });
  assert.equal(half.slot, "route");
  assert.match(half.message, /Uzbekistan/);
  assert.ok(half.options.some((o) => o.reply === "from Tashkent"));
  assert.equal(converse(half.draft, "Tashkent", { expecting: "route" }).status, "confirm");
});

test("a chosen direction the route contradicts is asked again", () => {
  const t = talk("import tea by train", "30 tonnes", "Tashkent to Moscow");
  assert.equal(t.slot, "direction");
  assert.match(t.message, /You chose import/);
  assert.deepEqual(t.options.map((o) => o.reply), ["export"]);
  const fixed = converse(t.draft, "export", { expecting: "direction" });
  assert.equal(fixed.status, "confirm");
  assert.equal(fixed.summary?.procedureId, "868");
});

test("a route that makes the chosen mode unpublished asks the mode again", () => {
  const t = talk("tea by air", "2 tonnes", "from China to Tashkent");
  assert.equal(t.slot, "mode");
  assert.match(t.message, /air/i);
  assert.deepEqual(t.options.map((o) => o.reply), ["by train"]);

  const fixed = converse(t.draft, "by train", { expecting: "mode" });
  assert.equal(fixed.status, "confirm");
  assert.equal(fixed.summary?.procedureId, "477");
});

test("one reply can fill several details, and a later reply corrects one", () => {
  const t = talk("export 60 tonnes of tea from Tashkent to Moscow by train");
  assert.equal(t.status, "confirm");
  assert.equal(t.summary?.procedureId, "868");
  assert.equal(t.summary?.steps, 48);
  assert.equal(t.progress.length, 5);
  assert.ok(t.progress.every((row) => row.done));

  const air = converse(t.draft, "actually by air", { expecting: null });
  assert.equal(air.slot, "quantity", "60 t by air needs a freighter - confirm or switch");
});

test("the confirm card carries country notes from the supplied fixture", () => {
  const t = talk("export 20 tonnes of tomatoes from Andijan to Kazakhstan");
  assert.equal(t.status, "confirm");
  assert.equal(t.summary?.procedureId, "325");
  assert.ok(t.notes.some((n) => /Form CT-1/.test(n)));
  assert.ok(t.notes.some((n) => /Almaty/.test(n) && /assumed/i.test(n)));
  assert.ok(t.notes.some((n) => /Phytosanitary certificate for fresh produce/.test(n)));
});

test("small talk is declined; unknown goods are named and the question stays open", () => {
  assert.equal(converse(EMPTY_DRAFT, "what is the weather like today").status, "declined");
  const cotton = converse(EMPTY_DRAFT, "export cotton by train");
  assert.equal(cotton.slot, "commodity");
  assert.match(cotton.message, /cotton/);
});
