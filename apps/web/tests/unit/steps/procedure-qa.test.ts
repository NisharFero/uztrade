import assert from "node:assert/strict";
import test from "node:test";
import { answerProcedureQuestion, answerRoutedProcedureQuestion, routeProcedureQuestion } from "../../../modules/steps/procedure-qa";
import { assistantView } from "../../../modules/steps/assistant";
import { createLlmClient } from "../../../modules/ai/llm";
import { runOrchestrator } from "../../../modules/workflow/orchestrator";
import { PROCEDURES } from "../../../modules/procedures/sync";
import { extractShipmentFacts, instantiateWorkflow } from "../../../modules/workflow/domain";
import { createMemoryWorkflowRepository } from "../../../modules/workflow/repository";

async function openRun(procedureId = "868") {
  const repository = createMemoryWorkflowRepository();
  const caseId = `QA-${procedureId}`;
  const runId = `workflow:${caseId}`;
  const procedure = PROCEDURES[procedureId];
  await repository.createRun(
    { id: runId, caseId, procedureVersionId: `procedure:${procedureId}:v1`, status: "running", cycle: 0 },
    instantiateWorkflow(procedure, runId),
    extractShipmentFacts("export 60 tonnes of tea from Tashkent to Moscow by train"),
  );
  await runOrchestrator(repository, runId);
  const projection = await repository.getProjection(runId);
  const view = assistantView(procedure, projection, caseId);
  return { procedure, projection, view };
}

function routingLlm(route: string, confidence = 0.92, extra: Record<string, unknown> = {}) {
  return createLlmClient({
    groqApiKey: "test",
    fetch: (async () =>
      new Response(
        JSON.stringify({
          model: "test-router",
          choices: [{ message: { content: JSON.stringify({ route, confidence, reason: "test route", ...extra }) } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as typeof fetch,
    timeoutMs: 1000,
  });
}

test("answers the current step and stage from the live case", async () => {
  const { procedure, projection, view } = await openRun();

  const step = answerProcedureQuestion({ question: "what step am i currently in?", procedure, projection, view });
  assert.equal(step.kind, "answer");
  assert.equal(step.title, "Current step");
  assert.match(step.message, /Step 1/);
  assert.match(step.message, /Register/);
  assert.ok(step.bullets.some((b) => /stage/i.test(b) && /Registration/i.test(b)));

  const stage = answerProcedureQuestion({ question: "what stage am I currently in?", procedure, projection, view });
  assert.equal(stage.title, "Current stage");
  assert.match(stage.message, /Registration/i);
  assert.ok(stage.bullets.some((b) => /Steps 1-1/));
});

test("answers which documents are needed now and before starting", async () => {
  const { procedure, projection, view } = await openRun();

  const answer = answerProcedureQuestion({ question: "what docs do i need to provide?", procedure, projection, view });
  assert.equal(answer.kind, "answer");
  assert.equal(answer.title, "Documents needed");
  assert.ok(answer.bullets.some((b) => /Electronic copy of foreign trade contract/i.test(b)));
  assert.ok(answer.bullets.some((b) => /Before you start/i));
});

test("answers required fields for a named document", async () => {
  const { procedure, projection, view } = await openRun();

  const answer = answerProcedureQuestion({ question: "what details required in the commercial invoice?", procedure, projection, view });
  assert.equal(answer.kind, "answer");
  assert.equal(answer.title, "Commercial invoice details");
  assert.ok(answer.bullets.some((b) => /Invoice number/i));
  assert.ok(answer.bullets.some((b) => /Total value/i));
  assert.ok(answer.bullets.some((b) => /Currency of invoice/i));
});

test("reports timing without inventing entity approval SLA", async () => {
  const { procedure, projection, view } = await openRun();

  const answer = answerProcedureQuestion({ question: "how much time it will take to approved by entities?", procedure, projection, view });
  assert.equal(answer.kind, "answer");
  assert.equal(answer.title, "Time and approvals");
  assert.match(answer.message, /ETA/i);
  assert.ok(answer.bullets.some((b) => /published procedure does not give an entity approval SLA/i));
});

test("maps fresh produce goods to procedure 325", async () => {
  const { procedure, projection, view } = await openRun();

  for (const good of ["tomato", "brinjal", "apple"]) {
    const answer = answerProcedureQuestion({ question: `I want to export ${good}`, procedure, projection, view });
    assert.equal(answer.kind, "answer", good);
    assert.equal(answer.procedureId, "325", good);
    assert.match(answer.message, /fresh fruits and vegetables/i, good);
  }
});

test("asks for confirmation before using a fuzzy goods correction", async () => {
  const { procedure, projection, view } = await openRun();

  const answer = answerProcedureQuestion({ question: "tomota intake", procedure, projection, view });
  assert.equal(answer.kind, "clarify");
  assert.equal(answer.confirmation?.value, "tomatoes");
  assert.match(answer.message, /Did you mean tomatoes/i);
  assert.equal(answer.procedureId, "325");
});

test("routes ambiguous export-document questions to a follow-up when a case is active", async () => {
  const { procedure, projection, view } = await openRun();

  const route = await routeProcedureQuestion({
    question: "what documents are needed for export?",
    procedure,
    projection,
    view,
    llm: routingLlm("clarify", 0.81, {
      question: "Do you mean documents for your current shipment, or export documents generally?",
      options: ["My current shipment", "General export documents"],
    }),
  });

  assert.equal(route.route, "clarify");
  assert.match(route.question, /current shipment/i);

  const answer = await answerRoutedProcedureQuestion({ question: "what documents are needed for export?", procedure, projection, view, llm: undefined });
  assert.equal(answer.kind, "clarify");
  assert.match(answer.message, /current shipment/i);
  assert.ok(answer.bullets.some((b) => /General export documents/i));
});

test("routes clearly current shipment questions to the case answer", async () => {
  const { procedure, projection, view } = await openRun();

  const answer = await answerRoutedProcedureQuestion({ question: "what docs do I need now for my shipment?", procedure, projection, view });

  assert.equal(answer.kind, "answer");
  assert.equal(answer.title, "Documents needed");
  assert.ok(answer.bullets.some((b) => /Electronic copy of foreign trade contract/i));
});

test("routes general export questions to FAQ instead of current case details", async () => {
  const { procedure, projection, view } = await openRun();

  const answer = await answerRoutedProcedureQuestion({
    question: "what documents are needed for export generally?",
    procedure,
    projection,
    view,
    llm: routingLlm("general_faq"),
  });

  assert.equal(answer.kind, "answer");
  assert.equal(answer.title, "General procedure answer");
  assert.ok(answer.bullets.some((b) => /sources/i));
  assert.notEqual(answer.title, "Documents needed", "general route must not use the current-case document answer");
});
