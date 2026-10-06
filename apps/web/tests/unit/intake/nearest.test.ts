import assert from "node:assert/strict";
import test from "node:test";
import { createLlmClient } from "../../../modules/ai/llm";
import { EMPTY_DRAFT } from "../../../modules/intake/draft";
import { nearestCategory } from "../../../modules/intake/nearest";
import { intakeTurn } from "../../../modules/intake/turn";

const model = (answer: object) =>
  createLlmClient({
    groqApiKey: "k",
    fetch: (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))) as unknown as typeof fetch,
  });

const SAFFRON = {
  product: "saffron",
  category: "cereals",
  hs: "0910",
  reason: "Saffron is a dried food crop, published with cereals",
  close: true,
};

test("goods no category names are proposed to the nearest published one, with the reasoning", async () => {
  const turn = await intakeTurn(EMPTY_DRAFT, "export saffron by air", null, model(SAFFRON));

  assert.equal(turn.slot, "commodity");
  assert.equal(turn.draft.commodity, null, "nothing is decided until the trader says yes");
  assert.equal(turn.draft.proposal?.category, "cereals");
  assert.equal(turn.draft.proposal?.term, "saffron", "the product keeps its own name");
  assert.match(turn.message, /Saffron is a dried food crop/);
  assert.doesNotMatch(
    turn.message,
    /HS /,
    "0910 is not in the app's nomenclature extract, so the heading the model volunteered is not shown as though it had been checked",
  );
  assert.deepEqual(turn.options.map((o) => o.reply), ["yes", "no"]);
});

test("the trader's yes sets the goods; their no reopens the question", async () => {
  const asked = await intakeTurn(EMPTY_DRAFT, "export saffron by air", null, model(SAFFRON));

  const yes = await intakeTurn(asked.draft, "yes", "commodity", undefined);
  assert.equal(yes.draft.commodity?.term, "saffron");
  assert.equal(yes.draft.commodity?.category, "cereals");
  assert.equal(yes.draft.proposal, null);
  assert.ok(yes.notes.some((n) => /Saffron opened under the published cereals procedure/.test(n)));

  const no = await intakeTurn(asked.draft, "no", "commodity", undefined);
  assert.equal(no.draft.commodity, null);
  assert.equal(no.draft.proposal, null);
  assert.equal(no.slot, "commodity");
});

test("a category the model invents is dropped rather than proposed", async () => {
  const invented = await nearestCategory("export moon rocks", model({ ...SAFFRON, product: "moon rocks", category: "space minerals" }));
  assert.deepEqual(invented, { kind: "none", product: "moon rocks" }, "the goods are named; the invented category is not");

  // Rail transport for any cargo is a service, not a goods category.
  const logistics = await nearestCategory("import copper wire", model({ ...SAFFRON, product: "copper wire", category: "any cargo" }));
  assert.deepEqual(logistics, { kind: "none", product: "copper wire" });

  const nothingFits = await nearestCategory("export moon rocks", model({ ...SAFFRON, product: "moon rocks", close: false }));
  assert.deepEqual(nothingFits, { kind: "none", product: "moon rocks" });

  const noModel = await nearestCategory("export moon rocks", undefined);
  assert.equal(noModel, null, "without a model there is no proposal, and intake says what is published");
});

test("goods nothing covers are refused by name, not by asking again", async () => {
  const turn = await intakeTurn(EMPTY_DRAFT, "export moon rocks by air", null, model({ ...SAFFRON, product: "moon rocks", close: false }));
  assert.match(turn.message, /No published procedure covers moon rocks/);
  assert.equal(turn.slot, "commodity");
  assert.equal(turn.draft.proposal, null);
  assert.ok(turn.options.length > 10, "and the published categories are offered");
});

test("a heading the nomenclature has is shown; one it doesn't is dropped", async () => {
  const known = await intakeTurn(
    EMPTY_DRAFT,
    // "dried" on its own already resolves to dried fruits, so the goods here
    // must be a word the lexicon does not touch at all.
    "export ginseng root by train",
    null,
    model({ product: "ginseng root", category: "dried fruits", hs: "081340", reason: "Ginseng root is traded dried, with dried fruits", close: true }),
  );
  assert.equal(known.draft.proposal?.hs, "081340");
  assert.match(known.message, /HS 081340/);

  const unknown = await intakeTurn(
    EMPTY_DRAFT,
    "import baby formula by road",
    null,
    model({ product: "baby formula", category: "dairy products", hs: "2403", reason: "Infant formula is a dairy product", close: true }),
  );
  assert.equal(unknown.draft.proposal?.hs, "", "2403 is tobacco - a model's heading is never taken on trust");
  assert.doesNotMatch(unknown.message, /HS /);
});

test("goods the lexicon knows never reach the model", async () => {
  const turn = await intakeTurn(EMPTY_DRAFT, "export yoghurt by road", null, model(SAFFRON));
  assert.equal(turn.draft.commodity?.category, "dairy products");
  assert.equal(turn.draft.commodity?.term, "yoghurt");
  assert.equal(turn.draft.proposal, null);
});
