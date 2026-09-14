import assert from "node:assert/strict";
import test from "node:test";
import { mockEntities, mockUsers, procedureSeeds } from "../app/lib/backend-seed";

test("provides stable internal users for user-lane assignments", () => {
  const users = mockUsers();
  assert.deepEqual(users.map((user) => user.role), ["trader", "compliance_reviewer", "finance_approver", "operations_coordinator"]);
  assert.equal(new Set(users.map((user) => user.id)).size, users.length);
  assert.ok(users.every((user) => user.status === "active"));
});

test("normalizes every procedure counterparty into a unique mock entity", () => {
  const entities = mockEntities();
  assert.equal(entities.length, 25);
  assert.equal(new Set(entities.map((entity) => entity.canonicalName)).size, 25);
  assert.ok(entities.some((entity) => entity.type === "inspection"));
  assert.ok(entities.every((entity) => entity.simulationMode));
});

test("seeds all authoritative procedures as published version one", () => {
  const seeds = procedureSeeds();
  assert.deepEqual(seeds.map((seed) => seed.procedureId).sort(), ["306", "325", "477", "540", "868"]);
  assert.ok(seeds.every((seed) => seed.version === 1 && seed.status === "published"));
});
