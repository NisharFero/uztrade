import assert from "node:assert/strict";
import test from "node:test";
import { PROCEDURES } from "../../../modules/procedures/sync";
import { expiringItems } from "../../../modules/steps/expiry";
import { buildLedger } from "../../../modules/steps/ledger";
import { caseSchedule } from "../../../modules/steps/schedule";
import { caseTiming } from "../../../modules/steps/timing";
import { extractShipmentFacts, instantiateWorkflow } from "../../../modules/workflow/domain";
import { runOrchestrator } from "../../../modules/workflow/orchestrator";
import { createMemoryWorkflowRepository, type WorkflowProjection } from "../../../modules/workflow/repository";
import { tailorProcedure } from "../../../modules/workflow/tailor";

const node = (stepNum: number, lane: string, state: string) => ({
  id: `n${stepNum}`,
  runId: "r",
  blockId: "b1",
  blockName: "Block",
  stepNum,
  title: `Step ${stepNum}`,
  output: "",
  entityName: "Entity",
  channel: "Online: apply",
  lane,
  delegationReason: "",
  optional: false,
  state,
});

const at = (hhmm: string) => `2026-09-16T${hhmm}:00.000Z`;
const event = (nodeId: string, eventType: string, hhmm: string) => ({ id: `${nodeId}:${eventType}:${hhmm}`, runId: "r", nodeId, eventType, actorType: "system", data: {}, at: at(hhmm) });

const projectionOf = (nodes: unknown[], auditEvents: unknown[], artifacts: unknown[] = []) =>
  ({
    run: { id: "r", caseId: "c", procedureVersionId: "procedure:868:v1", status: "running", cycle: 0 },
    shipmentFacts: { goods: "tea", quantity: 20, unit: "t", origin: "Tashkent", destination: "Urumqi", mode: "train" },
    nodes,
    edges: [],
    workItems: [],
    agentRuns: [],
    artifacts,
    auditEvents,
  }) as unknown as WorkflowProjection;

test("the case's own events say who it waited on, and what went round again", () => {
  const projection = projectionOf(
    [node(3, "agent", "completed"), node(7, "user", "completed"), node(9, "physical", "needs_input")],
    [
      event("n3", "portal_under_review", "09:00"),
      event("n3", "portal_changes_requested", "09:30"),
      event("n3", "portal_under_review", "11:30"),
      event("n3", "portal_approved", "11:35"),
      event("n3", "agent_node_completed", "11:35"),
      event("n7", "work_item_created", "09:00"),
      event("n7", "work_item_completed", "13:00"),
      event("n9", "work_item_created", "10:00"),
    ],
  );

  const timing = caseTiming(projection, new Date(at("14:00")));
  assert.equal(timing.measured, true);
  assert.deepEqual(timing.waited, { you: 360, entity: 35, goods: 240, agent: 0 });
  assert.equal(timing.elapsedMinutes, 300, "wall clock from the first event to now, while a step is still open");
  assert.equal(timing.sumMinutes, 635, "steps overlap, so attention adds to more than the clock");

  const portalStep = timing.steps.find((s) => s.stepNum === 3)!;
  assert.deepEqual(portalStep.waited, { you: 120, entity: 35, goods: 0, agent: 0 }, "the entity's review and the wait for the trader are separated");
  assert.equal(portalStep.cycles, 1);
  assert.deepEqual(timing.rework, [{ stepNum: 3, title: "Step 3", cycles: 1 }]);
  assert.deepEqual(timing.openNow, [{ stepNum: 9, title: "Step 9", waitingOn: "goods", minutes: 240 }]);
  assert.equal(timing.slowest[0].stepNum, 7);
});

test("a run with no timestamps claims nothing", () => {
  const projection = projectionOf([node(1, "user", "needs_input")], [{ id: "a", runId: "r", nodeId: "n1", eventType: "work_item_created", actorType: "system", data: {} }]);
  const timing = caseTiming(projection);
  assert.equal(timing.measured, false);
  assert.equal(timing.elapsedMinutes, 0);
  assert.deepEqual(timing.steps, []);
});

test("the schedule names the longest chain nobody has started, and gives every other step its slack", async () => {
  const repository = createMemoryWorkflowRepository();
  const runId = "workflow:S";
  const facts = extractShipmentFacts("export 20 tonnes of tomatoes from Andijan to Almaty by train");
  const procedure = tailorProcedure(PROCEDURES["325"], facts);
  await repository.createRun({ id: runId, caseId: "S", procedureVersionId: "procedure:325:v1", status: "running", cycle: 0 }, instantiateWorkflow(procedure, runId), facts);
  await runOrchestrator(repository, runId);

  const schedule = caseSchedule(procedure, await repository.getProjection(runId));
  assert.ok(schedule.remainingHours[1] > 150 && schedule.remainingHours[1] <= 184, `remaining ${schedule.remainingHours[1]} h`);
  assert.match(schedule.longPole!.blockName, /internal phytosanitary/i, "for fresh produce that stage is the whole critical path");
  assert.equal(schedule.longPole!.started, false);

  assert.ok(schedule.startNow.length > 0);
  assert.equal(schedule.startNow[0].critical, true, "the most urgent open step comes first");
  assert.ok(schedule.startNow.some((r) => r.slackHours > 0), "steps off the critical path say how long they can wait");
  assert.match(schedule.startNow[0].why, /critical path/i);
  assert.ok(schedule.startNow.every((r) => r.blockHours[1] > 0));
});

test("what an entity issued, and what a document states, is checked against the time the case still needs", () => {
  const portal = (stepNum: number, title: string, reference: string, validUntil: string) => ({
    id: `portal:${stepNum}`,
    runId: "r",
    nodeId: `n${stepNum}`,
    type: "portal_application",
    name: title,
    simulated: true,
    data: {
      stepNum,
      nodeId: `n${stepNum}`,
      entity: "railway",
      entityName: "Uzbekistan Railways Single Window",
      service: "railway/cost-calculation",
      serviceTitle: title,
      applicationId: "a",
      reference,
      status: "approved",
      revision: 1,
      submitted: {},
      flags: [],
      outputs: { calculation_no: reference, valid_until: validUntil },
      message: "",
      version: stepNum,
      at: at("09:00"),
    },
  });
  const projection = projectionOf([node(3, "agent", "completed"), node(5, "agent", "completed")], [], [
    portal(3, "Cost calculation for railway services", "RW-2026-000001", "2026-09-20"),
    portal(5, "Electronic certificate for railway station", "RW-2026-000002", "2026-09-10"),
  ]);

  // 240 h of work left: the shipment can't finish before 26 September.
  const items = expiringItems({ projection, ledger: buildLedger(projection.artifacts), remainingHours: [120, 240], now: new Date(at("09:00")) });
  assert.deepEqual(items.map((i) => [i.reference, i.status]), [
    ["RW-2026-000002", "expired"],
    ["RW-2026-000001", "before_completion"],
  ]);
  assert.match(items[1].action, /step 3 again/i);
  // With little left to do it covers the shipment, but four days is still close enough to say so.
  assert.equal(expiringItems({ projection, ledger: buildLedger(projection.artifacts), remainingHours: [1, 2], now: new Date(at("09:00")) })[1].status, "soon");
  assert.equal(expiringItems({ projection, ledger: buildLedger(projection.artifacts), remainingHours: [1, 2], now: new Date("2026-09-01T09:00:00.000Z") })[1].status, "ok");
});
