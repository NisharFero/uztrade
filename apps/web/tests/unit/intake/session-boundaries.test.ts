import assert from "node:assert/strict";
import test from "node:test";
import { converse } from "../../../modules/intake/conversation";
import { EMPTY_DRAFT, mergeReply } from "../../../modules/intake/draft";
import { confirmsShipment } from "../../../modules/intake/confirmation";
import { intakeTurn } from "../../../modules/intake/turn";
const tea = () => converse(EMPTY_DRAFT, "export 20 tonnes of tea from Tashkent to Almaty by train");

test("new tomato request clears tea facts both before and after confirmation", () => {
  for (const initial of [converse(EMPTY_DRAFT, "I want to export tea by train"), tea()]) {
    const next = converse(initial.draft, "I want to export tomato to Germany", { expecting: initial.slot });
    assert.equal(next.slot, "mode");
    assert.equal(next.draft.commodity?.term, "tomatoes");
    assert.equal(next.draft.mode, null);
    assert.equal(next.draft.quantity, null);
    assert.equal(next.draft.origin, null);
    assert.equal(next.draft.destination?.country, "DE");
  }
});
test("short replies keep context; fresh same-goods requests reset it", () => {
  const initial = tea();
  const corrected = mergeReply(initial.draft, "actually by air").draft;
  assert.equal(corrected.mode, "air");
  assert.deepEqual(corrected.quantity, initial.draft.quantity);
  assert.deepEqual(corrected.destination, initial.draft.destination);
  const fresh = mergeReply(initial.draft, "I want to export tea to Germany").draft;
  assert.equal(fresh.mode, null);
  assert.equal(fresh.quantity, null);
  assert.equal(fresh.origin, null);
  assert.equal(mergeReply(initial.draft, "60", "quantity").draft.quantity?.value, 60);
});
test("same-category goods, another procedure, unsupported goods and restart clear old facts", () => {
  const tomatoes = mergeReply(EMPTY_DRAFT, "export 20 tonnes of tomatoes from Tashkent to Almaty by train").draft;
  assert.equal(mergeReply(tomatoes, "cucumbers").draft.mode, null);
  const selected = mergeReply(tea().draft, "Start procedure 325").draft;
  assert.equal(selected.procedureId, "325");
  assert.equal(selected.quantity, null);
  assert.equal(selected.destination, null);
  assert.equal(mergeReply(selected, "tomatoes").draft.procedureId, undefined);
  for (const message of ["I want to export saffron", "start over"]) {
    const next = converse(tea().draft, message);
    assert.notEqual(next.status, "confirm");
    assert.equal(next.draft.commodity, null);
    assert.equal(next.draft.quantity, null);
    assert.equal(next.draft.mode, null);
  }
});
test("confirmation cannot swallow a new shipment or correction", () => {
  for (const reply of ["yes", "go ahead", "yes please!"]) assert.ok(confirmsShipment(reply));
  for (const reply of ["yes I want to export tomato to Germany", "start procedure 325", "okay but by air", "yes, 40 tonnes instead"]) assert.equal(confirmsShipment(reply), false);
});
test("new requests beginning with yes or no replace pending proposals", async () => {
  const draft = { ...tea().draft, proposal: { term: "tea", category: "tea", hs: "0902", reason: "test" } };
  for (const message of ["yes I want to export tomatoes to Germany", "no I want to export tomatoes to Germany"]) {
    const next = await intakeTurn(draft, message, "commodity", undefined);
    assert.equal(next.draft.commodity?.term, "tomatoes");
    assert.equal(next.draft.mode, null);
    assert.equal(next.draft.proposal, null);
  }
});
