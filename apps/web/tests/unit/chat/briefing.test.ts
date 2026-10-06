import assert from "node:assert/strict";
import test from "node:test";
import { briefDocumentUpload, briefOpening, briefStep } from "../../../modules/steps/briefing";
import { say, chunksOf } from "../../../modules/assistant/say";
import type { StepView, Need } from "../../../modules/steps/next";
import type { IntakeTurn } from "../../../modules/intake/conversation";

const need = (over: Partial<Need> = {}): Need =>
  ({
    id: "n1",
    label: "Electronic copy of foreign trade contract",
    kind: "document",
    status: "missing",
    optional: false,
    detail: "",
    docType: "trade_contract",
    requiredFields: [],
    document: null,
    producedBy: null,
    value: null,
    autoFilled: false,
    output: false,
    form: null,
    notApplicable: false,
    ...over,
  }) as Need;

const step = (over: Partial<StepView> = {}): StepView =>
  ({
    nodeId: "n",
    stepNum: 1,
    title: "Register foreign trade contract in UEISFTO",
    blockName: "Registration",
    lane: "user",
    actionLabel: "You sign",
    agentHelp: "",
    entity: "Single portal of interactive state services",
    where: "my.gov.uz - unified state services my.gov.uz",
    channel: "Online: apply",
    output: "Identification number of foreign trade contract",
    state: "ready",
    workItemId: null,
    paused: false,
    needs: [need()],
    variants: [],
    ready: true,
    blocking: [],
    notes: [],
    portal: null,
    ...over,
  }) as StepView;

test("a step asks for the needed document in plain language and says why", () => {
  const brief = briefStep(step({ needs: [need(), need({ id: "n2", kind: "confirm", label: "Electronic digital signature" })] }));

  assert.equal(brief.headline, "Register foreign trade contract in UEISFTO");
  assert.equal(brief.paragraphs[0], "For this step, please send the electronic copy of foreign trade contract.");
  assert.equal(
    brief.paragraphs[1],
    "I need it so Single portal of interactive state services can issue the identification number of foreign trade contract, and so the document and risk agents can check the contract details against this shipment.",
  );
  assert.equal(brief.paragraphs[2], "I also need you to confirm electronic digital signature.");
  assert.equal(brief.paragraphs.join(" ").includes("my.gov.uz"), false);
});

test("the upload button is offered only for a document the step is waiting on", () => {
  assert.equal(briefStep(step()).upload?.label, "Electronic copy of foreign trade contract");

  assert.equal(briefStep(step({ needs: [need({ status: "have" })] })).upload, null);
  assert.equal(briefStep(step({ needs: [need({ kind: "value", label: "Contract number" })] })).upload, null);
  assert.equal(briefStep(step({ needs: [need({ notApplicable: true })] })).upload, null);
});

test("an agent step stays conversational", () => {
  const running = briefStep(step({ lane: "agent", needs: [] }));
  assert.equal(running.waiting, true);
  assert.equal(running.paragraphs[0], "I am handling register foreign trade contract in UEISFTO with Single portal of interactive state services.");
  assert.match(running.paragraphs.at(-1) ?? "", /I will come back/);

  const paused = briefStep(step({ lane: "agent", paused: true, needs: [] }));
  assert.equal(paused.waiting, false);
  assert.match(paused.paragraphs[0], /I need something from you/);
});

test("before a case opens, the shipment is summed up with what it will need", () => {
  const turn = {
    status: "confirm",
    draft: {},
    message: "",
    options: [],
    notes: ["20 t ≈ 1 covered wagon.", "Russia: EAEU member."],
    progress: [],
    summary: {
      what: "Carpets (HS 5701)",
      how: "By train",
      howMuch: "20 t ≈ 1 covered wagon",
      route: "Tashkent, Uzbekistan → Moscow, Russia",
      direction: "export",
      regime: "standard",
      procedureId: "1052",
      title: "Export of carpets by train",
      caseTitle: "Export of carpets by train",
      steps: 38,
      blocks: 5,
      query: "",
    },
  } as unknown as IntakeTurn;

  const needs = {
    documents: ["Electronic copy of foreign trade contract", "Passport", "Power of attorney", "Commercial invoice", "Packing list", "CMR"],
    details: ["Tax Identification Number", "Contract number"],
  };
  const spoken = say({ kind: "intake", turn, needs });

  assert.match(spoken.text, /^Here's the plan\. You're exporting 20 tonnes of carpets from Tashkent to Moscow by train, which is about 1 covered wagon\./);
  assert.match(spoken.text, /“Export of carpets by train”: 38 steps/);
  // What they'll need, by name, and that they don't need it all now.
  assert.match(spoken.text, /6 documents — electronic copy of foreign trade contract, passport, power of attorney, commercial invoice and 2 more/);
  assert.match(spoken.text, /2 details such as tax identification number and contract number/);
  assert.match(spoken.text, /You don't need them all now/);
  assert.match(spoken.text, /Shall I open the case and start with the first step\?$/);
  // Neither the old systematic promise nor the border trivia.
  assert.doesNotMatch(spoken.text, /only ask for the next document|EAEU member|origin proof|crossings/i);
  assert.equal(spoken.actions.confirm?.procedureId, "1052");
});

test("goods with several details missing are asked for one at a time", () => {
  const turn = {
    status: "asking",
    slot: "direction",
    message: "Tea: is it leaving Uzbekistan or coming in?",
    options: [],
    notes: [],
    draft: { commodity: { term: "tea", category: "tea", hs: "0902" }, statedDirection: null },
    progress: [
      { slot: "commodity", done: true },
      { slot: "direction", done: false },
      { slot: "mode", done: false },
      { slot: "regime", done: false },
      { slot: "quantity", done: false },
      { slot: "route", done: false },
    ],
  } as unknown as IntakeTurn;

  const spoken = say({ kind: "intake", turn });
  // Only the detail the turn is asking for; the rest come in later messages.
  assert.equal(spoken.text, "Tea: is it leaving Uzbekistan or coming in?");
  assert.doesNotMatch(spoken.text, /how much|which city|train, road or air/);
});

test("an uploaded document is explained as verified fields and missing details", () => {
  const lines = briefDocumentUpload({
    label: "Commercial invoice",
    parseError: null,
    fields: [
      { label: "Invoice number", value: "INV-22", required: true, status: "accepted" },
      { label: "Seller", value: "Tashkent Export LLC", required: true, status: "confirmed" },
      { label: "Gross weight", value: "20 tonnes", required: true, status: "review" },
      { label: "HS code", value: null, required: true, status: "missing" },
    ],
  });

  assert.equal(lines[0], "Got the commercial invoice.");
  assert.equal(lines[1], "The document agent verified invoice number and seller.");
  assert.equal(lines[2], "Please confirm gross weight, and add HS code if you have it.");
  assert.equal(lines[3], "Once those are clear, the risk agent can compare the invoice with the shipment route, value, weight and later customs documents.");
});

test("opening a case explains the flow without system-style procedure metrics", () => {
  const opening = briefOpening({
    view: {
      kpis: { total: 38, agentTotal: 12, etaHours: [24, 72] },
      upfront: { items: [{ kind: "document" }, { kind: "document" }, { kind: "value" }] },
    } as never,
    shipment: "20 t of carpets from Tashkent to Moscow by train",
    direction: "export",
    published: [72, 240],
    agentMinutesEach: 45,
  });

  const text = opening.paragraphs.join(" ");
  assert.match(text, /^Done — your export case for 20 t of carpets from Tashkent to Moscow by train is open\./);
  assert.match(text, /about 1–3 days instead of the usual 3–10 days/);
  assert.match(text, /Here's where we start\./);
  assert.doesNotMatch(text, /below|panel|Published end to end|agent steps/i, "nothing points at UI that isn't there");
  assert.equal(opening.comparison, null, "the comparison is said, not boxed");
});

test("the answer is streamed as words, and reassembles exactly", () => {
  const text = "Here is what I have.\n\nWant me to start it?";
  const chunks = chunksOf(text);
  assert.ok(chunks.length > 3, "a sentence arrives in several pieces");
  assert.equal(chunks.join(""), text, "nothing is lost or added in the splitting");
});
