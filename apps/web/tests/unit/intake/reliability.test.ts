import assert from "node:assert/strict";
import test from "node:test";
import { procedureReferenceIn } from "../../../modules/intake/reference";
import { converse, evaluate } from "../../../modules/intake/conversation";
import { EMPTY_DRAFT, parseDraft } from "../../../modules/intake/draft";
import { saveIntake, restoreIntake } from "../../../modules/intake/checkpoint";
import { runChat, type ChatEvent } from "../../../modules/assistant/chat";
import { classify } from "../../../modules/intake/classify";

test("questions, negations, multiple and unknown references never start a procedure", () => {
  for (const message of ["What is procedure 868?", "Don't start procedure 868", "Start procedure 999999", "Start procedure 868 or procedure 540", "instead of procedure 868", "What does Export of tea by train require?"]) assert.equal(procedureReferenceIn(message), null, message);
});

test("the direct classifier cannot override contradictory facts or invalid references", async () => {
  for (const message of ["Start procedure 868 import cheese by road", "Start procedure 999999 export tea by train", "Do not start procedure 868 export tea by train", "What does procedure 868 require?"]) {
    assert.equal((await classify(message)).procedureId, null, message);
  }
});

test("side questions cannot overwrite an unfinished shipment through intake", () => {
  const turn = converse(EMPTY_DRAFT, "export tea by train");
  const side = converse(turn.draft, "What documents do I need for importing cheese by road?", { expecting: turn.slot });
  assert.equal(side.status, "declined");
  assert.deepEqual(side.draft, turn.draft);
});

test("selected procedure rejects contradictory details and restores pending inputs", () => {
  const selected = converse(EMPTY_DRAFT, "Start procedure 868");
  assert.equal(selected.slot, "quantity");
  for (const text of ["by air", "import", "cheese"]) {
    const changed = converse(selected.draft, text);
    assert.equal(changed.status, "asking", text);
    assert.equal(changed.summary, undefined);
  }
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  saveIntake(storage, selected);
  const restored = restoreIntake(storage)!;
  const confirmed = converse(restored.draft, "5 tonnes from Tashkent to Almaty", { expecting: restored.slot });
  assert.equal(confirmed.summary?.procedureId, "868");
  assert.equal(evaluate(parseDraft(JSON.parse(JSON.stringify(confirmed.draft)))).status, "confirm");
  saveIntake(storage, null);
  assert.equal(restoreIntake(storage), null);
});

test("text callers receive the answer; card callers receive the same structured estimate", async () => {
  const deps = { listCases: async () => [], projection: async () => null };
  const text: ChatEvent[] = [], cards: ChatEvent[] = [];
  const input = { message: "How long will tea by train from Tashkent to Almaty take?", draft: EMPTY_DRAFT, expecting: null };
  await runChat(input, deps, (e) => text.push(e));
  await runChat({ ...input, presentation: "cards" }, deps, (e) => cards.push(e));
  assert.match(text.flatMap((e) => e.type === "text" ? [e.chunk] : []).join(""), /door to door/);
  assert.deepEqual(text.find((e) => e.type === "result"), cards.find((e) => e.type === "result"));
});
