import assert from "node:assert/strict";
import test from "node:test";
import { createLlmClient } from "../../../modules/ai/llm";
import { answerAboutCases, digestCase, selectCases, summarize } from "../../../modules/assistant/cases";
import { caseFollowUps, knowledgeFollowUps, runChat, type ChatDeps, type ChatEvent } from "../../../modules/assistant/chat";
import { parseDraft } from "../../../modules/intake/draft";
import type { WorkflowProjection } from "../../../modules/workflow/repository";
import { inSentence, startsSentence } from "../../../modules/shared/text";

const row = (id: string, status: string, done: number) => ({
  id,
  procedureId: "868",
  title: "Export of tea by train",
  query: "Export 20 tonnes of tea from Tashkent to Almaty by train",
  status,
  shipmentFacts: JSON.stringify({ goods: "tea", quantity: 20, unit: "tonnes", origin: "Tashkent", destination: "Almaty", mode: "train" }),
  updatedAt: "2026-09-17T10:00:00Z",
  workflowRunId: `workflow:${id}`,
  blocks: Array.from({ length: 10 }, (_, i) => ({ blockId: `b${i + 1}`, state: i < done ? "done" : i === done ? "running" : "waiting" })),
});

const ROWS = [row("UZ-2609-0002", "active", 3), row("UZ-2609-0001", "complete", 10)];

const projection = {
  nodes: [
    { stepNum: 14, title: "Pay the fee", lane: "user", blockName: "Certificate", state: "needs_input" },
    { stepNum: 12, title: "Apply online", lane: "agent", blockName: "Certificate", state: "needs_input" },
    { stepNum: 3, title: "Done step", lane: "user", blockName: "Contract", state: "completed" },
  ],
} as unknown as WorkflowProjection;

const reply = (content: (system: string) => object) =>
  createLlmClient({
    groqApiKey: "k",
    fetch: (async (_url: string, init: RequestInit) => {
      const system = JSON.parse(String(init.body)).messages[0].content as string;
      return new Response(JSON.stringify({ model: "m", choices: [{ message: { content: JSON.stringify(content(system)) } }] }));
    }) as unknown as typeof fetch,
  });

const deps = (llm?: ChatDeps["llm"]): ChatDeps => ({ llm, listCases: async () => ROWS, projection: async () => projection });

async function run(message: string, d: ChatDeps, caseId?: string) {
  const events: ChatEvent[] = [];
  await runChat({ message, draft: parseDraft(null), expecting: null, caseId }, d, (e) => events.push(e));
  return events;
}

const resultOf = (events: ChatEvent[]) => {
  const found = events.find((e) => e.type === "result");
  assert.ok(found && found.type === "result", "a result was emitted");
  return found.result;
};

test("a digest carries progress and the open steps, lowest first", async () => {
  const d = await digestCase(ROWS[0], projection);
  assert.equal(d.stagesDone, 3);
  assert.equal(d.stagesTotal, 10);
  assert.equal(d.running.length, 1);
  assert.deepEqual(
    d.openSteps.map((s) => s.stepNum),
    [12, 14],
  );
  // The summary names the shipment, not just its id, and says what to do
  // rather than quoting a step number on its own.
  const line = summarize([d], "active");
  assert.match(line, /Export of tea by train/);
  assert.match(line, /UZ-2609-0002/);
  assert.match(line, /Next on you: pay the fee \(step 14\)/);
});

test("selection follows named cases first, then the filter", () => {
  assert.deepEqual(selectCases(ROWS, { caseIds: [], filter: "active" }).map((c) => c.id), ["UZ-2609-0002"]);
  assert.deepEqual(selectCases(ROWS, { caseIds: [], filter: "complete" }).map((c) => c.id), ["UZ-2609-0001"]);
  assert.deepEqual(selectCases(ROWS, { caseIds: ["UZ-2609-0001"], filter: "active" }).map((c) => c.id), ["UZ-2609-0001"]);
  assert.match(summarize([], "active"), /No active cases/);
});

test("a cases answer that states what the digests don't is replaced by the summary", async () => {
  const digests = [await digestCase(ROWS[0], projection)];
  const good = await answerAboutCases("what's waiting on me?", digests, "active", reply(() => ({ answer: "UZ-2609-0002 waits on you to pay the fee at step 14." })));
  assert.equal(good.by, "model");
  const invented = await answerAboutCases("when will it finish?", digests, "active", reply(() => ({ answer: "UZ-2609-0002 finishes in 36 hours." })));
  assert.equal(invented.by, "summary");
  assert.match(invented.answer, /UZ-2609-0002/);
});

test("'what shipments are currently active?' is answered from the cases, not the FAQ", async () => {
  const events = await run("What shipments are currently active?", deps());
  const route = events.find((e) => e.type === "route");
  assert.equal(route?.type === "route" && route.routed.intent, "cases");
  const result = resultOf(events);
  assert.equal(result.kind, "cases");
  if (result.kind !== "cases") return;
  assert.deepEqual(
    result.answer.cases.map((c) => c.id),
    ["UZ-2609-0002"],
  );
  assert.equal(events.at(-1)?.type, "done");
  assert.ok(events.filter((e) => e.type === "stage").length >= 3, "stages are streamed");
});

test("the model routes; procedure questions get a cited answer, shipments an intake turn", async () => {
  const llm = reply((system) =>
    /router of UzTrade/.test(system)
      ? { reasoning: "A general question.", intent: "knowledge", caseIds: [], filter: "any" }
      : { found: true, answer: "Apply online through the Single Window [1].", citations: [1] },
  );
  const knowledge = resultOf(await run("Where do I apply for the phytosanitary certificate for dried fruits?", deps(llm)));
  assert.equal(knowledge.kind, "knowledge");
  if (knowledge.kind === "knowledge") assert.equal(knowledge.answer.found, true);

  const shipment = resultOf(await run("I want to export tea", deps()));
  assert.equal(shipment.kind, "intake");
  if (shipment.kind === "intake") assert.equal(shipment.turn.status, "asking");
});

test("an unknown case is said to be unknown; no database still answers", async () => {
  const unknown = resultOf(await run("status of UZ-2601-0042?", deps()));
  assert.equal(unknown.kind, "cases");
  if (unknown.kind === "cases") {
    assert.deepEqual(unknown.answer.unknown, ["UZ-2601-0042"]);
    assert.match(unknown.answer.answer, /no case UZ-2601-0042/);
  }

  const offline: ChatDeps = {
    listCases: async () => {
      throw new Error("no D1");
    },
    projection: async () => null,
  };
  const none = resultOf(await run("which of my shipments are active?", offline));
  assert.equal(none.kind, "cases");
  if (none.kind === "cases") assert.match(none.answer.answer, /No active cases/);
});

test("every answer comes with next messages that fit it", async () => {
  const one = resultOf(await run("UZ-2609-0002 status", deps()));
  assert.equal(one.kind, "cases");
  if (one.kind === "cases") {
    const followUps = caseFollowUps(one.answer);
    assert.ok(followUps.some((f) => /Pay the fee/.test(f.text)), "the step waiting on the trader");
    assert.ok(followUps.some((f) => f.text.includes("UZ-2609-0002")));
  }

  const events = await run("I want to export tea", deps());
  const intake = events.find((e) => e.type === "result");
  assert.ok(intake?.type === "result");
  assert.deepEqual(
    intake.followUps.map((f) => f.text),
    ["by train", "by air"],
  );

  const sources = knowledgeFollowUps({
    question: "q",
    found: true,
    answer: "a",
    by: "model",
    model: null,
    withheld: null,
    sources: [{ id: "step:868:20", title: "Export of tea by train · step 20: Apply for phytosanitary certificate", text: "", href: null }],
  });
  assert.ok(sources.length > 1 && sources.length <= 3);
  assert.match(sources[0].text, /Apply for phytosanitary certificate/);
  assert.ok(sources.some((f) => f.text === "I want to export tea by train"));
});

test("case tool answers document and risk questions from workflow data", async () => {
  const docs = resultOf(await run("What documents do I need for UZ-2609-0002?", deps()));
  assert.equal(docs.kind, "cases");
  if (docs.kind === "cases") {
    assert.equal(docs.answer.by, "summary");
    assert.match(docs.answer.answer, /Export of tea by train/);
    assert.doesNotMatch(docs.answer.answer, /I don't know/i);
    assert.match(docs.answer.answer, /Pay the fee|For this step|document/i);
  }

  const risk = resultOf(await run("What did the risk agent verify for UZ-2609-0002?", deps()));
  assert.equal(risk.kind, "cases");
  if (risk.kind === "cases") {
    assert.equal(risk.answer.by, "summary");
    assert.match(risk.answer.answer, /risk agent/i);
    assert.match(risk.answer.answer, /uploaded document|checks? passed|mismatch|evidence/i);
  }
});

test("case tools answer ETA, status and agent-tool questions before the model", async () => {
  for (const [question, pattern] of [
    ["When will UZ-2609-0002 finish?", /Estimated time left|usual full-flow estimate/i],
    ["What is the status of UZ-2609-0002?", /steps are complete|stages are done/i],
    ["Show agent tools for UZ-2609-0002", /Document analysis|Transit agent/i],
  ] as const) {
    const result = resultOf(await run(question, deps()));
    assert.equal(result.kind, "cases");
    if (result.kind !== "cases") continue;
    assert.equal(result.answer.by, "summary");
    assert.match(result.answer.answer, pattern);
  }
});

test("a session with an active case scopes vague case questions to that shipment", async () => {
  const result = resultOf(await run("what is waiting on me?", deps(), "UZ-2609-0001"));
  assert.equal(result.kind, "cases");
  if (result.kind !== "cases") {
    return;
  }
  assert.deepEqual(
    result.answer.cases.map((c) => c.id),
    ["UZ-2609-0001"],
  );
});

test("a place the digests don't mention is an invented place", async () => {
  const digests = [await digestCase(ROWS[0], projection)];

  // The tea in ROWS[0] goes to Almaty. Asked about several shipments at once a
  // model will carry one destination across the rest, which reads as fact.
  const moved = await answerAboutCases(
    "which are active?",
    digests,
    "active",
    reply(() => ({ answer: "The tea to Moscow (UZ-2609-0002) needs the fee paid." })),
  );
  assert.equal(moved.by, "summary", "an invented destination falls back to what the app knows");
  assert.match(moved.answer, /Almaty/);

  // The real destination is fine.
  const right = await answerAboutCases(
    "which are active?",
    digests,
    "active",
    reply(() => ({ answer: "The tea to Almaty (UZ-2609-0002) needs the fee paid." })),
  );
  assert.equal(right.by, "model");
});

test("a title set into a sentence keeps its acronyms", () => {
  assert.equal(inSentence("Register foreign trade contract in UEISFTO"), "register foreign trade contract in UEISFTO");
  // The form's code keeps its capitals; the ordinary word in front of it does
  // not need them mid-sentence.
  assert.equal(inSentence("Obtain certificate of origin Form CT-1"), "obtain certificate of origin form CT-1");
  assert.equal(inSentence("Pay the fee"), "pay the fee");
  assert.equal(startsSentence("pay the fee"), "Pay the fee");
});

test("an active-case session cannot produce intake for another shipment", async () => {
  const events: ChatEvent[] = [];
  await runChat({ message: "I want to export tomatoes to Germany", draft: parseDraft(null), expecting: null, caseId: "UZ-2609-0002" }, { listCases: async () => ROWS, projection: async () => projection }, (event) => events.push(event));
  assert.equal(events.some((event) => event.type === "result" && event.result.kind === "intake"), false);
  assert.ok(events.some((event) => event.type === "result" && event.result.kind === "other" && /new shipment session/i.test(event.result.message)));
});
