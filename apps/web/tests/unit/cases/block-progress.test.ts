import assert from "node:assert/strict";
import test from "node:test";
import { deriveBlockProgress } from "../../../modules/workflow/dag-projection";
import type { WorkflowNodeRecord } from "../../../modules/workflow/repository";

const node = (blockId: string, stepNum: number, state: WorkflowNodeRecord["state"]): WorkflowNodeRecord => ({
  id: `${blockId}:${stepNum}`, runId: "run-1", blockId, blockName: blockId, stepNum,
  title: `Step ${stepNum}`, output: "Result", entityName: "Entity", channel: "In person",
  lane: "physical", delegationReason: "Goods must be present.", optional: false, state,
});

test("collapses step states into the existing block DAG states", () => {
  const progress = deriveBlockProgress([
    node("done", 1, "completed"), node("done", 2, "skipped"),
    node("active", 3, "completed"), node("active", 4, "needs_input"),
    node("waiting", 5, "waiting"),
  ]);
  assert.deepEqual(progress, { done: "done", active: "running", waiting: "waiting" });
});
