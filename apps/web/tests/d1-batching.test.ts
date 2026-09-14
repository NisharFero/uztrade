import assert from "node:assert/strict";
import test from "node:test";
import { chunkForD1 } from "../app/lib/d1-batching";

test("bounds wide D1 inserts to five rows per statement", () => {
  const chunks = chunkForD1(Array.from({ length: 48 }, (_, index) => index));
  assert.equal(chunks.length, 10);
  assert.ok(chunks.every((chunk) => chunk.length <= 5));
});
