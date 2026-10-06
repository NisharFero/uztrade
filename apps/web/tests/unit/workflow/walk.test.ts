import assert from "node:assert/strict";
import test from "node:test";
import { walk } from "../../../scripts/audit/walk";

/* The whole road, not one step: a trader giving each step what it asks for
 * reaches the end of the case. One procedure per kind of journey here; all
 * 243 with `npx tsx scripts/audit/walk-procedures.ts`. */
const SAMPLE = [
  "868", // export by train, the hand-checked reference
  "477", // import by train
  "540", // export by air
  "161", // clearance by road
  "57", // road transit under TIR
  "782", // rail logistics, any cargo
];

for (const id of SAMPLE) {
  test(`procedure ${id} runs from an opened case to its last step`, async () => {
    const outcome = await walk(id);
    assert.equal(outcome.status, "completed", `${id} ${outcome.status} at step ${outcome.at}: ${outcome.reason}`);
  });
}
