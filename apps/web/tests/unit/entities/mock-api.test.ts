import assert from "node:assert/strict";
import test from "node:test";
import { mockEntities } from "../../../modules/catalog/seed";
import { buildLedger } from "../../../modules/steps/ledger";
import { instantiateWorkflow, type ShipmentFacts } from "../../../modules/workflow/domain";
import { runOrchestrator } from "../../../modules/workflow/orchestrator";
import { createMemoryWorkflowRepository, type WorkflowProjection } from "../../../modules/workflow/repository";
import type { Procedure } from "../../../modules/procedures/data/procedures.generated";
import { entityIntegrationProfile, entityWorkItemView, issueEntityMockDocument, submitEntityWorkItem } from "../../../modules/entities/mock-api";

const procedure: Procedure = {
  id: "entity-mock",
  title: "Entity mock procedure",
  direction: "export",
  goods: "tea",
  mode: "train",
  timeframe: [2, 8],
  stepsCount: 1,
  entityDirectory: [],
  blocks: [
    {
      id: "inspection",
      name: "Inspection",
      dependsOn: [],
      level: 0,
      estDuration: [1, 6],
      dependencyReason: "Inspection starts immediately.",
      lane: "Physical",
      entities: ["Territorial Department of plant quarantine and protection"],
      stepRange: [1, 1],
      optionalSteps: [],
      altSteps: [],
      steps: [
        {
          num: 1,
          title: "Undergo phytosanitary inspection",
          output: "Phytosanitary inspection act",
          entity: "Territorial Department of plant quarantine and protection",
          channel: "In person",
          where: "Warehouse",
          performedBy: "",
          optional: false,
          alternative: false,
        },
      ],
    },
  ],
};

const facts: ShipmentFacts = {
  goods: "tea",
  quantity: 60,
  unit: "tonnes",
  origin: "Tashkent",
  destination: "Moscow",
  mode: "train",
};

async function openEntityWorkItem() {
  const repository = createMemoryWorkflowRepository();
  const runId = "workflow:entity-api";
  await repository.createRun(
    { id: runId, caseId: "CASE-ENTITY", procedureVersionId: "procedure:entity-mock:v1", status: "running", cycle: 0 },
    instantiateWorkflow(procedure, runId),
    facts,
  );
  await runOrchestrator(repository, runId);
  const projection = await repository.getProjection(runId);
  const item = projection.workItems[0];
  assert.ok(item, "expected an open entity work item");
  return { repository, runId, projection, item };
}

test("every seeded entity exposes a production-like mock integration profile", () => {
  for (const entity of mockEntities()) {
    const profile = entityIntegrationProfile(entity);
    assert.equal(profile.entity.id, entity.id);
    assert.equal(profile.mode, "mock");
    assert.ok(profile.basePath.endsWith(`/api/entities/${entity.id}`));
    assert.ok(profile.capabilities.length > 0, entity.canonicalName);
    assert.ok(profile.endpoints.some((endpoint) => endpoint.path.endsWith("/integration")));
    assert.ok(profile.endpoints.some((endpoint) => endpoint.path.endsWith("/work-items")));
    assert.equal(profile.authentication.type, "api_key");
  }
});

test("entity work item views expose the fields and uploads a real integration would request", async () => {
  const { projection, item } = await openEntityWorkItem();
  const entity = mockEntities().find((candidate) => candidate.id === item.entityId)!;
  const view = entityWorkItemView(entity, projection, item);

  assert.equal(view.id, item.id);
  assert.equal(view.caseId, "CASE-ENTITY");
  assert.equal(view.stepNum, 1);
  assert.equal(view.entity.id, entity.id);
  assert.ok(view.form.fields.some((field) => field.key === "caseReference" && field.value === "CASE-ENTITY"));
  assert.ok(view.form.fields.some((field) => field.key === "goodsLocation"));
  assert.ok(view.uploads.some((upload) => upload.label === "Phytosanitary inspection act"));
  assert.match(view.mockResponse.reference, /^MOCK-/);
});

test("entity submit refuses the wrong assignee and completes the assigned work item", async () => {
  const { repository, runId, item } = await openEntityWorkItem();

  await assert.rejects(
    () => submitEntityWorkItem(repository, runId, "ent-someone-else", item.id, { fields: { outcome: "passed" } }),
    /not assigned/i,
  );

  const after = await submitEntityWorkItem(repository, runId, item.entityId!, item.id, {
    fields: { outcome: "passed", inspectorName: "Mock inspector" },
    uploads: [{ label: "Phytosanitary inspection act", fileName: "inspection-act.pdf" }],
  });

  assert.equal(after.run.status, "completed");
  assert.equal(after.nodes[0].state, "completed");
  assert.equal(after.workItems[0].completedBy, item.entityId);
  assert.equal(after.workItems[0].result.verified, true);
  assert.ok(after.auditEvents.some((event) => event.actorType === "entity" && event.actorId === item.entityId));
});

test("mock entity documents are stored as uploaded-document artifacts for the assistant ledger", async () => {
  const { repository, runId, projection } = await openEntityWorkItem();
  const entity = mockEntities().find((candidate) => candidate.id === projection.workItems[0].entityId)!;

  const after: WorkflowProjection = await issueEntityMockDocument(repository, runId, entity, {
    stepNum: 1,
    label: "Phytosanitary certificate",
    docType: "phytosanitary_certificate",
    fields: { cert_no: "PHY-2026-4491", produce: "Black tea", quantity: "60 t" },
  });

  const ledger = buildLedger(after.artifacts);
  const document = ledger.documents.find((candidate) => candidate.docType === "phytosanitary_certificate");
  assert.ok(document);
  assert.equal(document.label, "Phytosanitary certificate");
  assert.equal(document.confirmed, true);
  assert.equal(document.fields.find((field) => field.key === "cert_no")?.value, "PHY-2026-4491");
  assert.ok(after.auditEvents.some((event) => event.eventType === "document_parsed"));
});
