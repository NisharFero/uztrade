import assert from "node:assert/strict";
import test from "node:test";
import { PROCEDURES, PROCEDURE_IDS } from "../../../modules/procedures/data/procedures.generated";
import {
  AUTO_VERIFIED_NOTE,
  complianceTasks,
  documentTasks,
  dueOutputs,
  stepPhaseResolver,
} from "../../../modules/documents/agent-tasks";
import { outputKey, requiredOutputsOf } from "../../../modules/documents/checklist";

const p325 = PROCEDURES["325"];
const firstBlock = p325.blocks.find((b) => requiredOutputsOf(b).some((r) => !r.optional))!;
const firstOutput = requiredOutputsOf(firstBlock).find((r) => !r.optional)!;
const key = outputKey(firstOutput.blockId, firstOutput.stepNum);

test("document tasks are unticked until their step completes, then queued, then ticked", () => {
  const waiting = stepPhaseResolver({});
  const pending = documentTasks(p325, {}, waiting).flatMap((g) => g.tasks).find((t) => t.key === key)!;
  assert.equal(pending.status, "pending");

  const completed = stepPhaseResolver({
    workflowNodes: [{ blockId: firstOutput.blockId, stepNum: firstOutput.stepNum, state: "completed" }],
  });
  const queued = documentTasks(p325, {}, completed).flatMap((g) => g.tasks).find((t) => t.key === key)!;
  assert.equal(queued.status, "running", "a finished step's document is in progress until the agent verifies it");
  assert.deepEqual(
    dueOutputs(p325, {}, completed).map((r) => outputKey(r.blockId, r.stepNum)),
    [key],
    "only the completed step's document is due for auto-verification",
  );

  const verifyingNow = documentTasks(p325, {}, waiting, key).flatMap((g) => g.tasks).find((t) => t.key === key)!;
  assert.equal(verifyingNow.status, "running");
  assert.equal(verifyingNow.note, "Verifying…");

  const state = { [key]: { provided: true, note: AUTO_VERIFIED_NOTE } };
  const done = documentTasks(p325, state, completed).flatMap((g) => g.tasks).find((t) => t.key === key)!;
  assert.equal(done.status, "done");
  assert.equal(dueOutputs(p325, state, completed).length, 0, "nothing left to verify once saved");
});

test("a block completed from the drawer completes every step in it", () => {
  const phaseOf = stepPhaseResolver({
    blockStates: { [firstBlock.id]: "done" },
    workflowNodes: [{ blockId: firstOutput.blockId, stepNum: firstOutput.stepNum, state: "waiting" }],
  });
  assert.equal(phaseOf(firstOutput.blockId, firstOutput.stepNum), "completed");
});

test("document tasks never include optional-route outputs", () => {
  for (const id of PROCEDURE_IDS) {
    const optional = new Set(
      PROCEDURES[id].blocks.flatMap((b) => requiredOutputsOf(b).filter((r) => r.optional).map((r) => outputKey(r.blockId, r.stepNum))),
    );
    const listed = documentTasks(PROCEDURES[id], {}, stepPhaseResolver({})).flatMap((g) => g.tasks);
    assert.ok(listed.length > 0, `${id} lists documents`);
    assert.ok(listed.every((t) => !optional.has(t.key)), `${id} lists no optional outputs`);
  }
});

test("compliance analysis completes itself; filing checks follow their step", () => {
  for (const id of PROCEDURE_IDS) {
    const template = complianceTasks(PROCEDURES[id]);
    const analysis = template.filter((t) => !t.key.startsWith("filing:"));
    const filings = template.filter((t) => t.key.startsWith("filing:"));
    assert.ok(analysis.length >= 3, `${id} classifies, estimates duty and screens risk`);
    assert.ok(analysis.every((t) => t.status === "done"), `${id} analysis needs no confirmation`);
    assert.ok(filings.length > 0, `${id} has customs filings to check`);
    assert.ok(filings.every((t) => t.status === "pending"), `${id} filings wait for the case to reach them`);
  }

  const filing = complianceTasks(p325).find((t) => t.key.startsWith("filing:"))!;
  const [, blockId, stepNum] = filing.key.split(":");
  const node = (state: string) => stepPhaseResolver({ workflowNodes: [{ blockId, stepNum: Number(stepNum), state }] });
  const statusAt = (state: string) => complianceTasks(p325, node(state)).find((t) => t.key === filing.key)!.status;
  assert.equal(statusAt("waiting"), "pending");
  assert.equal(statusAt("needs_input"), "running");
  assert.equal(statusAt("completed"), "done");
});
