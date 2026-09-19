import assert from "node:assert/strict";
import test from "node:test";
import { PROCEDURES, type Procedure } from "../../../modules/procedures/sync";
import { extractShipmentFacts, instantiateWorkflow } from "../../../modules/workflow/domain";
import { runOrchestrator } from "../../../modules/workflow/orchestrator";
import { specialistFor, executeSpecialist } from "../../../modules/workflow/specialists";
import { createMemoryWorkflowRepository } from "../../../modules/workflow/repository";
import { completeWorkflowWorkItem } from "../../../modules/workflow/service";

const procedure: Procedure = {
  id: "tomato-train", title: "Move tomatoes by train", direction: "export", goods: "tomatoes", mode: "train", timeframe: [2, 8], stepsCount: 3, entityDirectory: [],
  blocks: [
    { id: "documents", name: "Documents", dependsOn: [], level: 0, estDuration: [1, 2], dependencyReason: "Start immediately.", lane: "Agent", entities: ["One-stop service system Single Window"], stepRange: [1, 2], optionalSteps: [], altSteps: [], steps: [
      { num: 1, title: "Create export document", output: "Draft declaration", entity: "One-stop service system Single Window", channel: "Online: apply", where: "Portal", performedBy: "", optional: false, alternative: false },
      { num: 2, title: "Submit export declaration", output: "Accepted declaration", entity: "One-stop service system Single Window", channel: "Online: submit", where: "Portal", performedBy: "", optional: false, alternative: false },
    ] },
    { id: "inspection", name: "Inspection", dependsOn: ["documents"], level: 1, estDuration: [1, 6], dependencyReason: "Inspection starts after declaration.", lane: "Physical", entities: ["Plant quarantine inspector"], stepRange: [3, 3], optionalSteps: [], altSteps: [], steps: [
      { num: 3, title: "Undergo phytosanitary inspection", output: "Inspection report", entity: "Plant quarantine inspector", channel: "In person", where: "Warehouse", performedBy: "", optional: false, alternative: false },
    ] },
  ],
};

test("routes specialist work deterministically", async () => {
  const workflow = instantiateWorkflow(procedure, "run-specialists");
  assert.equal(specialistFor(workflow.nodes[0]), "document_intelligence");
  const result = await executeSpecialist(workflow.nodes[0], extractShipmentFacts("20 tonnes of tomatoes from Tashkent to Dubai by train"));
  assert.equal(result.simulated, true);
  assert.equal(result.artifactType, "document");
});

test("auto-runs agents, pauses external work, and resumes exactly once", async () => {
  const repository = createMemoryWorkflowRepository();
  const runId = "run-1";
  await repository.createRun({ id: runId, caseId: "case-1", procedureVersionId: "procedure:tomato-train:v1", status: "running", cycle: 0 }, instantiateWorkflow(procedure, runId), extractShipmentFacts("move 20 tonnes of tomatoes from Tashkent to Dubai by train"));

  await runOrchestrator(repository, runId);
  let projection = await repository.getProjection(runId);
  assert.deepEqual(projection.nodes.map((node) => node.state), ["completed", "needs_input", "waiting"]);
  assert.equal(projection.agentRuns.length, 1);
  assert.equal(projection.workItems.length, 1);
  assert.equal(projection.workItems[0].lane, "user");

  await assert.rejects(
    () => completeWorkflowWorkItem(repository, projection.workItems[0].id, { approved: true }, "usr-trader"),
    /verified/i,
  );
  await completeWorkflowWorkItem(repository, projection.workItems[0].id, { approved: true, verified: true }, "usr-trader");
  projection = await repository.getProjection(runId);
  assert.deepEqual(projection.nodes.map((node) => node.state), ["completed", "completed", "needs_input"]);
  assert.equal(
    projection.agentRuns.filter((run) => run.nodeId === projection.nodes[0].id).length,
    1,
    "a completed agent node is not executed again while resuming",
  );
  assert.equal(projection.workItems.length, 2);
  assert.ok(projection.artifacts.some((artifact) => artifact.type === "inspection_booking"));

  await assert.rejects(
    () => completeWorkflowWorkItem(repository, projection.workItems[0].id, { approved: true, verified: true }, "usr-trader"),
    /already completed/i,
  );

  const physical = projection.workItems.find((item) => item.lane === "physical")!;
  await completeWorkflowWorkItem(repository, physical.id, { outcome: "passed", verified: true }, physical.entityId!);
  projection = await repository.getProjection(runId);
  assert.equal(projection.run.status, "completed");
  assert.ok(projection.nodes.every((node) => node.state === "completed"));
});

test("document intelligence states what a step needs and requests amendments for missing inputs", async () => {
  const real = PROCEDURES["325"];
  const node = instantiateWorkflow(real, "run-325").nodes.find((n) => n.stepNum === 41)!;
  assert.equal(specialistFor(node), "document_intelligence");
  const facts = extractShipmentFacts("export 20 tonnes of tomatoes from Tashkent to Almaty by train");

  const before = await executeSpecialist(node, facts, { procedure: real, completedSteps: new Set([1, 30, 36]) });
  assert.equal(before.data.completeness, "incomplete");
  assert.deepEqual(before.data.amendmentsRequested, [{ document: "Export railway bill (SMGS)", producedByStep: 40 }]);
  assert.ok((before.data.checklists as { document: string }[]).some((c) => c.document === "Commercial invoice"));

  const after = await executeSpecialist(node, facts, { procedure: real, completedSteps: new Set([1, 30, 36, 40]) });
  assert.equal(after.data.completeness, "complete");
});

test("compliance specialist returns the real assessment for a published procedure", async () => {
  const real = PROCEDURES["868"];
  const node = instantiateWorkflow(real, "run-868").nodes.find((n) => /customs fee/i.test(n.title))!;
  assert.equal(specialistFor(node), "compliance_risk");
  const result = await executeSpecialist(node, extractShipmentFacts("export tea by train"), { procedure: real });
  assert.equal(result.data.ruleKey, "tea×export");
  assert.ok(!("decision" in result.data), "no mock decision");
  assert.ok((result.data.riskFlags as { evidence: string[] }[]).some((f) => f.evidence.length > 0));
});

test("skips an optional route when it was not selected", async () => {
  const optionalProcedure = structuredClone(procedure);
  optionalProcedure.blocks = [{ ...optionalProcedure.blocks[0], steps: [{ ...optionalProcedure.blocks[0].steps[0], optional: true }] }];
  optionalProcedure.stepsCount = 1;
  const repository = createMemoryWorkflowRepository();
  await repository.createRun(
    { id: "run-optional", caseId: "case-optional", procedureVersionId: "procedure:optional:v1", status: "running", cycle: 0 },
    instantiateWorkflow(optionalProcedure, "run-optional"),
    extractShipmentFacts("move tomatoes from Tashkent to Dubai by train"),
  );
  const projection = await runOrchestrator(repository, "run-optional");
  assert.equal(projection.nodes[0].state, "skipped");
  assert.equal(projection.run.status, "completed");
  assert.equal(projection.workItems.length, 0);
});
