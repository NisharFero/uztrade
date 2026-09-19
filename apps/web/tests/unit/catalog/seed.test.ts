import assert from "node:assert/strict";
import test from "node:test";
import { mockEntities, mockUsers, procedureSeeds } from "../../../modules/catalog/seed";
import { PROCEDURE_IDS } from "../../../modules/procedures/sync";

test("provides stable internal users for user-lane assignments", () => {
  const users = mockUsers();
  assert.deepEqual(users.map((user) => user.role), ["trader", "compliance_reviewer", "finance_approver", "operations_coordinator"]);
  assert.equal(new Set(users.map((user) => user.id)).size, users.length);
  assert.ok(users.every((user) => user.status === "active"));
});

test("normalizes every procedure counterparty into a unique mock entity", () => {
  const entities = mockEntities();
  // One row per distinct counterparty named across the 243 published procedures.
  assert.ok(entities.length > 30, `${entities.length} entities`);
  assert.equal(new Set(entities.map((entity) => entity.canonicalName)).size, entities.length);
  assert.ok(entities.some((entity) => entity.type === "inspection"));
  assert.ok(entities.every((entity) => entity.simulationMode));
});

test("seeds all authoritative procedures as published version one", () => {
  const seeds = procedureSeeds();
  assert.equal(seeds.length, PROCEDURE_IDS.length);
  assert.deepEqual([...seeds.map((seed) => seed.procedureId)].sort(), [...PROCEDURE_IDS].sort());
  assert.ok(seeds.every((seed) => seed.version === 1 && seed.status === "published"));
});
