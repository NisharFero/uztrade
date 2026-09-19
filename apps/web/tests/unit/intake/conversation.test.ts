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
  assert.equal(fixed.slot, "route");
  assert.match(fixed.message, /which city in China/i);
  const city = converse(fixed.draft, "Urumqi", { expecting: "route" });
  assert.equal(city.status, "confirm");
  assert.equal(city.summary?.procedureId, "477");
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
  assert.equal(t.slot, "route");
  assert.match(t.message, /which city in Kazakhstan/i);

  const confirmed = converse(t.draft, "Almaty", { expecting: "route" });
  assert.equal(confirmed.status, "confirm");
  assert.equal(confirmed.summary?.procedureId, "325");
  assert.ok(confirmed.notes.some((n) => /Form CT-1/.test(n)));
  assert.ok(confirmed.notes.every((n) => !/assumed/i.test(n)));
  assert.ok(confirmed.notes.some((n) => /Phytosanitary certificate for fresh produce/.test(n)));
});

test("country-only routes ask for the city inside that country before confirming", () => {
  const base = talk("export tea by train", "20 tonnes");
  const country = converse(base.draft, "to Russia", { expecting: "route" });
  assert.equal(country.slot, "route");
  assert.match(country.message, /from where in Uzbekistan/i);

  const homeCity = converse(country.draft, "from Tashkent", { expecting: "route" });
  assert.equal(homeCity.slot, "route");
  assert.match(homeCity.message, /which city in Russia/i);
  assert.ok(homeCity.options.some((o) => o.reply === "to Kazan"));

  const destinationCity = converse(homeCity.draft, "Kazan", { expecting: "route" });
  assert.equal(destinationCity.status, "confirm");
  assert.equal(destinationCity.summary?.route, "Tashkent, Uzbekistan → Kazan, Russia");
});

test("a complete query with only a country destination asks only for that city", () => {
  const turn = converse(EMPTY_DRAFT, "export 20 tonnes of tea from Tashkent to Russia by train");
  assert.equal(turn.status, "asking");
  assert.equal(turn.slot, "route");
  assert.match(turn.message, /which city in Russia/i);
  assert.deepEqual(turn.progress.filter((row) => !row.done).map((row) => row.slot), ["route"]);
  assert.ok(turn.options.some((option) => option.reply === "to Kazan"));

  const confirmed = converse(turn.draft, "Kazan", { expecting: "route" });
  assert.equal(confirmed.status, "confirm");
  assert.equal(confirmed.summary?.route, "Tashkent, Uzbekistan → Kazan, Russia");
});

test("while only the city is missing: progress shows the country, and odd answers keep the one question", () => {
  const turn = converse(EMPTY_DRAFT, "export 20 tonnes of tea from Tashkent to Russia by train");
  assert.equal(turn.progress.find((row) => row.slot === "route")?.value, "Tashkent → Russia (city?)", "the assumed city isn't shown as chosen");

  const unknown = converse(turn.draft, "Sochi", { expecting: "route" });
  assert.equal(unknown.slot, "route");
  assert.match(unknown.message, /Sochi/);
  assert.match(unknown.message, /which city in Russia/i);
  assert.ok(unknown.options.some((o) => o.reply === "to Kazan"), "the Russian city options stay on offer");

  const elsewhere = converse(turn.draft, "Almaty", { expecting: "route" });
  assert.equal(elsewhere.status, "confirm");
  assert.match(elsewhere.message, /Almaty is in Kazakhstan, not Russia/);

  const imported = converse(EMPTY_DRAFT, "import 20 tonnes of tea from China to Bukhara by train");
  assert.equal(imported.slot, "route");
  assert.match(imported.message, /which city in China is it from/i);
  assert.deepEqual(imported.progress.filter((row) => !row.done).map((row) => row.slot), ["route"]);
  assert.ok(imported.options.some((o) => o.reply === "from Urumqi"));
  assert.equal(converse(imported.draft, "Urumqi", { expecting: "route" }).summary?.procedureId, "477");
});

test("small talk is declined; unknown goods are named and the question stays open", () => {
  assert.equal(converse(EMPTY_DRAFT, "what is the weather like today").status, "declined");
  const cotton = converse(EMPTY_DRAFT, "export cotton by train");
  assert.equal(cotton.slot, "commodity");
  assert.match(cotton.message, /cotton/);
});

test("general procedure questions do not start shipment intake", () => {
  const docs = converse(EMPTY_DRAFT, "What documents are needed for export?");
  assert.equal(docs.status, "declined");
  assert.equal(docs.slot, undefined);
  assert.equal(docs.draft.statedDirection, null);

  const timing = converse(EMPTY_DRAFT, "How long does export approval take?");
  assert.equal(timing.status, "declined");
  assert.equal(timing.slot, undefined);
  assert.equal(timing.draft.statedDirection, null);
});

test("actual shipment intents with export still start intake", () => {
  const turn = converse(EMPTY_DRAFT, "I want to export tea");
  assert.equal(turn.status, "asking");
  assert.equal(turn.slot, "mode");
  assert.equal(turn.draft.statedDirection, "export");
});

test("juices, fertilizers and rail logistics each reach their own procedure", () => {
  const walk = (...messages: string[]) => {
    let turn = converse(EMPTY_DRAFT, messages[0]);
    for (const message of messages.slice(1)) turn = converse(turn.draft, message, { expecting: turn.slot ?? null });
    return turn;
  };
  assert.equal(walk("I want to export apple juice", "20 tonnes", "from Tashkent to Almaty").summary?.procedureId, "161");
  assert.equal(walk("import manure", "by train", "44 tonnes", "from Almaty to Tashkent").summary?.procedureId, "707");
  const road = walk("import organic fertilizer by truck", "3 trucks", "from Bishkek to Tashkent");
  assert.equal(road.summary?.procedureId, "57");
  assert.match(road.summary?.howMuch ?? "", /3 trucks/);
  assert.equal(walk("arrange cargo transportation by train", "40 tonnes", "from Tashkent to Almaty").summary?.procedureId, "782");

  const asked = converse(EMPTY_DRAFT, "I need to arrange rail transport");
  assert.equal(asked.slot, "direction");
  assert.deepEqual(asked.options.map((o) => o.reply), ["export", "import"]);
  assert.equal(walk("I need to arrange rail transport", "take delivery", "60 tonnes", "from Moscow to Tashkent").summary?.procedureId, "924");

  const mineral = converse(EMPTY_DRAFT, "export urea fertilizer");
  assert.match(mineral.message, /No published procedure covers mineral fertilizers/);
});
