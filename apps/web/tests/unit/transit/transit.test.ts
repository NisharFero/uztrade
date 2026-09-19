import assert from "node:assert/strict";
import test from "node:test";
import { PROCEDURES } from "../../../modules/procedures/sync";
import { extractShipmentFacts, instantiateWorkflow } from "../../../modules/workflow/domain";
import { createMemoryWorkflowRepository, type WorkflowProjection } from "../../../modules/workflow/repository";
import { runOrchestrator } from "../../../modules/workflow/orchestrator";
import { buildLedger, inputKey, INPUT_ARTIFACT } from "../../../modules/steps/ledger";
import { tailorProcedure } from "../../../modules/workflow/tailor";
import { specialistFor } from "../../../modules/workflow/specialists";
import { milestoneOfStep, transitView, MILESTONES } from "../../../modules/transit/transit";
import { latestTransitState, transitStates } from "../../../modules/transit/agent";

const QUERY = "export 20 tonnes of tomatoes from Samarkand to Almaty by train";
const procedure = () => tailorProcedure(PROCEDURES["325"], extractShipmentFacts(QUERY), QUERY);

function projectionFor(done: number[] = []): { projection: WorkflowProjection; proc: ReturnType<typeof procedure> } {
  const proc = procedure();
  const runId = "workflow:T-transit";
  const workflow = instantiateWorkflow(proc, runId);
  const nodes = workflow.nodes.map((n) => (done.includes(n.stepNum) ? { ...n, state: "completed" as const } : n));
  return {
    proc,
    projection: {
      run: { id: runId, caseId: "T-transit", procedureVersionId: "procedure:325:v1", status: "running", cycle: 0 },
      shipmentFacts: extractShipmentFacts(QUERY),
      nodes,
      edges: workflow.edges,
      workItems: [],
      agentRuns: [],
      artifacts: [],
      auditEvents: [],
    },
  };
}

const view = (done: number[] = []) => {
  const { projection, proc } = projectionFor(done);
  return transitView({ caseId: "T-transit", procedure: proc, facts: projection.shipmentFacts, query: QUERY, projection, ledger: buildLedger([]) });
};

test("capacity and equipment are sized from the load, not from the procedure title", () => {
  const v = view();
  assert.equal(v.capacity.tonnes, 20);
  assert.ok(v.capacity.units.count >= 1);
  // Fresh produce by rail travels refrigerated.
  assert.match(v.capacity.units.kind, /refrigerated/i);
  assert.match(v.capacity.equipment, /Refrigerated/i);
  assert.equal(v.capacity.limitPerUnitT, 68);
  assert.ok(v.route, "the route is resolved from the query");
  assert.equal(v.route!.origin, "Samarkand", "the route comes from what the trader said, not the published procedure");
  assert.equal(v.route!.destination, "Almaty");
});

test("the movement milestone follows the steps that are actually done", () => {
  const start = view();
  assert.equal(start.status.milestone, "planned");
  assert.ok(start.status.total > 0, "the procedure has movement steps");
  assert.ok(start.status.next, "something is waiting to move");

  const steps = procedure().blocks.flatMap((b) => b.steps);
  const loading = steps.filter((s) => milestoneOfStep(s) === "loaded").map((s) => s.num);
  assert.ok(loading.length, "325 has a loading step");
  const loaded = view(loading);
  assert.equal(loaded.status.milestone, "loaded");
  assert.ok(MILESTONES.indexOf(loaded.status.milestone) > MILESTONES.indexOf(start.status.milestone));
  assert.ok(loaded.legs.some((l) => l.id === "load" && l.state === "done"));
});

test("a load that overfills the declared units is reported as a movement exception", () => {
  const { projection, proc } = projectionFor();
  const ledger = buildLedger([
    {
      id: "input:1",
      runId: projection.run.id,
      nodeId: null,
      type: INPUT_ARTIFACT,
      name: "Quantity of transport units",
      data: { key: inputKey("value", 0, "Quantity of transport units"), kind: "value", stepNum: 0, label: "Quantity of transport units", value: "1", version: 1 },
      simulated: true,
    },
  ]);
  const v = transitView({ caseId: "T", procedure: proc, facts: { ...projection.shipmentFacts, quantity: 200, unit: "t" }, query: QUERY, projection, ledger });
  const limit = v.exceptions.find((e) => /load limit/i.test(e.title));
  assert.ok(limit, "200 t in one wagon is over the limit");
  assert.equal(limit!.severity, "high");
  assert.ok(v.exceptions.some((e) => /capacity does not match/i.test(e.title)));
});

test("transport steps belong to the transit agent, and the agent records the state it reaches", async () => {
  const proc = procedure();
  const loading = proc.blocks.flatMap((b) => b.steps).find((s) => /loading/i.test(s.title))!;
  const workflow = instantiateWorkflow(proc, "workflow:T-x");
  const node = workflow.nodes.find((n) => n.stepNum === loading.num)!;
  assert.equal(specialistFor(node), "transit_capacity");

  const repository = createMemoryWorkflowRepository();
  const runId = "workflow:T-record";
  await repository.createRun(
    { id: runId, caseId: "T-record", procedureVersionId: "procedure:325:v1", status: "running", cycle: 0 },
    instantiateWorkflow(proc, runId),
    extractShipmentFacts(QUERY),
  );
  const projection = await runOrchestrator(repository, runId);
  const state = latestTransitState(projection);
  assert.ok(state, "the transit agent recorded where the cargo stands");
  assert.equal(state!.units.kind, view().capacity.units.kind);
  assert.ok(projection.auditEvents.some((e) => e.eventType === "transit_state_changed" && e.actorId === "transit_capacity"));

  // Running again with nothing moved records nothing new.
  const again = await runOrchestrator(repository, runId);
  assert.equal(transitStates(again).length, transitStates(projection).length);
});
