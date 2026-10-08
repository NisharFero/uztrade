import assert from "node:assert/strict";
import test from "node:test";
import { converse } from "../../../modules/intake/conversation";
import { EMPTY_DRAFT } from "../../../modules/intake/draft";

for (const [query, missing] of [
  ["export tea from Tashkent to Atlantis by train", "Atlantis"],
  ["export tea from Unknownville to Almaty by train", "Unknownville"],
  ["export tea from Unknownville to Atlantis by train", "Unknownville"],
  ["export tea to Atlantis", "Atlantis"],
  ["export tea from Tashkent to Unknownville, Germany by train", "Unknownville"],
]) test(`unlisted location: ${query}`, () => {
  const turn = converse(EMPTY_DRAFT, query);
  assert.equal(turn.status, "asking");
  assert.equal(turn.slot, "route");
  assert.ok(turn.message.includes(missing));
  assert.match(turn.message, /not added.*country or city data/);
  assert.equal(turn.summary, undefined);
});

test("an unlisted correction clears the old destination instead of confirming it", () => {
  const ready = converse(EMPTY_DRAFT, "export 20 tonnes of tea from Tashkent to Almaty by train");
  const next = converse(ready.draft, "to Atlantis");
  assert.equal(next.draft.destination, null);
  assert.equal(next.status, "asking");
  assert.match(next.message, /Atlantis.*not added/);
});

test("a bare unlisted city answer gets the same data message", () => {
  const initial = converse(EMPTY_DRAFT, "export 20 tonnes of tea from Tashkent to Germany by train");
  const next = converse(initial.draft, "Unknownville", { expecting: "route" });
  assert.match(next.message, /Unknownville.*not added/);
});
