import assert from "node:assert/strict";
import test from "node:test";
import { buildDagProjection } from "../app/lib/dag-projection";
import type { WorkflowProjection } from "../app/lib/workflow-repository";

test("returns only the workflow data required to render and act on the DAG", () => {
  const projection = {
    run: { id: "run-1", caseId: "case-1", procedureVersionId: "procedure:325:v1", status: "waiting_for_input", cycle: 2 },
    shipmentFacts: { goods: "tomatoes", quantity: 20, unit: "tonnes", origin: "Tashkent", destination: "Dubai", mode: "train" },
    nodes: [{ id: "node-1", runId: "run-1", blockId: "b1", blockName: "Register", stepNum: 1, title: "Sign registration", output: "Registration", entityName: "State portal", channel: "Online: submit", lane: "user", delegationReason: "Requires the trader signature.", optional: false, state: "needs_input", assignedUserId: "usr-trader", result: {}, attempts: 0 }],
    edges: [],
    workItems: [{ id: "work-1", runId: "run-1", nodeId: "node-1", lane: "user", assigneeUserId: "usr-trader", state: "open", request: { mock: true }, result: {} }],
    agentRuns: [{ id: "agent-1", runId: "run-1", nodeId: "node-1", agentName: "test", attempt: 1, status: "completed", input: {}, output: {} }],
    artifacts: [{ id: "artifact-1", runId: "run-1", type: "document", name: "x", data: {}, simulated: true }],
    auditEvents: [],
  } satisfies WorkflowProjection;

  const dag = buildDagProjection(projection);
  assert.deepEqual(dag.progress, { completed: 0, total: 1, percent: 0 });
  assert.deepEqual(dag.current, {
    nodeId: "node-1",
    blockId: "b1",
    stepNum: 1,
    title: "Sign registration",
    lane: "user",
    state: "needs_input",
  });
  assert.deepEqual(dag.shipment, projection.shipmentFacts);
  assert.deepEqual(dag.nodes[0].action, { workItemId: "work-1", kind: "complete_mock" });
  assert.equal(dag.nodes[0].reason, "Requires the trader signature.");
  assert.equal("agentRuns" in dag, false);
  assert.equal("artifacts" in dag, false);
  assert.equal("auditEvents" in dag, false);
});
