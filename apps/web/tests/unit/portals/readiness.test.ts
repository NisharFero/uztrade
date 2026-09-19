import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { PROCEDURES } from "../../../modules/procedures/sync";
import { createPortalClient } from "../../../modules/portals/client";
import { caseReadiness } from "../../../modules/portals/readiness";
import { extractShipmentFacts, instantiateWorkflow } from "../../../modules/workflow/domain";
import { runOrchestrator } from "../../../modules/workflow/orchestrator";
import { createMemoryWorkflowRepository } from "../../../modules/workflow/repository";
import { tailorProcedure } from "../../../modules/workflow/tailor";

type Handle = (request: Request) => Promise<Response>;

async function entityApis() {
  const { createPortalApp } = (await import(pathToFileURL(path.resolve(process.cwd(), "../portals/src/app.ts")).href)) as {
    createPortalApp: (options: { reviewMs: number; now: () => Date }) => Handle;
  };
  const handle = createPortalApp({ reviewMs: 0, now: () => new Date("2026-09-16T08:00:00Z") });
  return createPortalClient({
    baseUrl: "http://entities.test",
    fetch: ((input: RequestInfo | URL, init?: RequestInit) => handle(new Request(input, init))) as typeof fetch,
  });
}

async function openCase(procedureId = "868") {
  const repository = createMemoryWorkflowRepository();
  const runId = "workflow:R";
  const query = "export 20 tonnes of tea from Tashkent to Urumqi by train";
  const facts = extractShipmentFacts(query);
  const procedure = tailorProcedure(PROCEDURES[procedureId], facts, query);
  await repository.createRun({ id: runId, caseId: "R", procedureVersionId: `procedure:${procedureId}:v1`, status: "running", cycle: 0 }, instantiateWorkflow(procedure, runId), facts);
  await runOrchestrator(repository, runId);
  return { procedure, projection: await repository.getProjection(runId) };
}

test("what the entities will ask for later is asked at the start, once per field", async () => {
  const portals = await entityApis();
  const { procedure, projection } = await openCase();
  const readiness = await caseReadiness(procedure, projection, portals);

  assert.ok(readiness.checked >= 8, `${readiness.checked} steps checked`);
  assert.equal(readiness.unavailable, false);
  const labels = readiness.needs.map((n) => n.label);
  assert.ok(labels.includes("Applicant INN"), labels.join(" | "));

  const inn = readiness.needs.find((n) => n.label === "Applicant INN")!;
  assert.match(inn.detail, /steps 3, 5/, "one item, naming every step that wants it");

  const hs = readiness.needs.find((n) => /10 digits/.test(n.label))!;
  assert.ok(hs, labels.join(" | "));
  assert.match(hs.detail, /Customs/);
  assert.match(hs.detail, /step 41/);
  assert.ok(hs.suggestions?.some((s) => /^0902\d{6}$/.test(s.value)), "HS candidates come from the nomenclature, for the trader to choose");
});

test("with the entity APIs down the panel says so instead of guessing", async () => {
  const down = createPortalClient({ baseUrl: "http://entities.test", fetch: (async () => { throw new TypeError("fetch failed"); }) as typeof fetch });
  const { procedure, projection } = await openCase();
  const readiness = await caseReadiness(procedure, projection, down);
  assert.equal(readiness.unavailable, true);
  assert.deepEqual(readiness.needs, []);
});
