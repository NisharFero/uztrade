import assert from "node:assert/strict";
import test from "node:test";
import type { Procedure } from "../../../modules/procedures/data/procedures.generated";
import {
  extractShipmentFacts,
  instantiateWorkflow,
  validateProcedure,
} from "../../../modules/workflow/domain";

const procedure: Procedure = {
  id: "tomato-train",
  title: "Move tomatoes by train",
  direction: "export",
  goods: "tomatoes",
  mode: "train",
  timeframe: [2, 8],
  stepsCount: 3,
  entityDirectory: [],
  blocks: [
    {
      id: "documents",
      name: "Prepare documents",
      dependsOn: [],
      level: 0,
      estDuration: [1, 2],
      dependencyReason: "The shipment needs a declaration before inspection.",
      lane: "Agent",
      entities: ["One-stop service system Single Window"],
      stepRange: [1, 2],
      optionalSteps: [],
      altSteps: [],
      steps: [
        { num: 1, title: "Create declaration", output: "Draft", entity: "One-stop service system Single Window", channel: "Online: apply", where: "Portal", performedBy: "", optional: false, alternative: false },
        { num: 2, title: "Submit declaration", output: "Declaration", entity: "One-stop service system Single Window", channel: "Online: submit", where: "Portal", performedBy: "", optional: false, alternative: false },
      ],
    },
    {
      id: "inspection",
      name: "Inspect goods",
      dependsOn: ["documents"],
      level: 1,
      estDuration: [1, 6],
      dependencyReason: "Inspection starts after the declaration is available.",
      lane: "Physical",
      entities: ["Plant quarantine inspector"],
      stepRange: [3, 3],
      optionalSteps: [],
      altSteps: [],
      steps: [
        { num: 3, title: "Undergo inspection", output: "Inspection report", entity: "Plant quarantine inspector", channel: "In person", where: "Warehouse", performedBy: "", optional: false, alternative: false },
      ],
    },
  ],
};

test("extracts shipment facts from a natural-language request", () => {
  assert.deepEqual(
    extractShipmentFacts("I want to move 20 tonnes of tomatoes from Tashkent to Dubai by train"),
    {
      goods: "tomatoes",
      quantity: 20,
      unit: "tonnes",
      origin: "Tashkent",
      destination: "Dubai",
      mode: "train",
    },
  );
});

test("rejects cyclic procedure dependencies", () => {
  const cyclic = structuredClone(procedure);
  cyclic.blocks[0].dependsOn = ["inspection"];
  assert.throws(() => validateProcedure(cyclic), /cycle/i);
});

test("instantiates ordered step nodes and preserves dependency reasons", () => {
  const workflow = instantiateWorkflow(procedure, "run-1");
  assert.equal(workflow.nodes.length, 3);
  assert.equal(workflow.nodes[0].lane, "agent");
  assert.equal(workflow.nodes[1].lane, "user");
  assert.equal(workflow.nodes[2].lane, "physical");
  assert.deepEqual(workflow.edges.map((edge) => [edge.fromNodeId, edge.toNodeId]), [
    ["run-1:documents:1", "run-1:documents:2"],
    ["run-1:documents:2", "run-1:inspection:3"],
  ]);
  assert.match(workflow.edges[1].reason, /Inspection starts after/);
});
