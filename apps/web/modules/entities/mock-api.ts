import { eq } from "drizzle-orm";
import { workItems } from "../../db/schema";
import type { SeedEntity } from "../catalog/seed";
import { DOC_SPECS, docTypeOf, specFor, type DocField, type DocType } from "../documents/specs";
import type { ExtractedField } from "../documents/docai/compose";
import { HttpError } from "../shared/http";
import { nextVersion, type DocumentRecord } from "../steps/ledger";
import { recordDocument } from "../steps/service";
import { completeWorkflowWorkItem } from "../workflow/service";
import type { AgenticAiClient } from "../workflow/agentic-ai";
import type { PortalClient } from "../portals/client";
import type { ShipmentFacts } from "../workflow/domain";
import type { WorkflowNodeRecord, WorkflowProjection, WorkflowRepository, WorkItemRecord } from "../workflow/repository";

type EntityLike = Pick<SeedEntity, "id" | "canonicalName" | "capabilities"> & {
  simulationMode: boolean;
  type: string;
  status: string;
  contact?: unknown;
};

type FieldKind = "text" | "date" | "select" | "number" | "textarea";

type SubmitField = {
  key: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  value: string | null;
  source: "case" | "entity" | "mock";
};

type UploadRequest = {
  label: string;
  required: boolean;
  docType: DocType | null;
  acceptedContentTypes: string[];
};

export type EntityIntegrationProfile = {
  mode: "mock";
  entity: {
    id: string;
    canonicalName: string;
    type: string;
    status: string;
    simulationMode: boolean;
  };
  basePath: string;
  authentication: { type: "api_key"; header: "x-uztrade-mock-key"; value: "mock-development-key" };
  capabilities: { key: string; label: string; methods: string[] }[];
  endpoints: { method: "GET" | "POST"; path: string; purpose: string }[];
  mockData: { latencyMs: number; reliability: "deterministic"; environment: "sandbox" };
};

export type EntityWorkItemView = {
  id: string;
  caseId: string;
  runId: string;
  stepNum: number;
  blockName: string;
  title: string;
  state: WorkItemRecord["state"];
  entity: { id: string; canonicalName: string; type: string };
  form: { title: string; fields: SubmitField[] };
  uploads: UploadRequest[];
  submit: { method: "POST"; path: string };
  mockResponse: { reference: string; status: string; expectedOutput: string | null };
};

export type EntitySubmission = {
  fields?: Record<string, unknown>;
  uploads?: { label: string; fileName?: string; docType?: DocType | string | null }[];
};

export type EntityDocumentInput = {
  caseId?: string;
  stepNum: number;
  label: string;
  docType?: DocType | string | null;
  fields?: Record<string, unknown>;
};

function slug(value: string): string {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function capabilityTemplates(entity: EntityLike) {
  const text = `${entity.type} ${entity.canonicalName}`.toLowerCase();
  if (entity.type === "bank" || text.includes("bank")) {
    return [
      { key: "accept_payment", label: "Accept payment by reference", methods: ["GET", "POST"] },
      { key: "issue_receipt", label: "Issue payment receipt", methods: ["POST"] },
      { key: "reconcile_reference", label: "Reconcile platform payment reference", methods: ["POST"] },
    ];
  }
  if (entity.type === "inspection" || /inspection|quarantine|sanitary/.test(text)) {
    return [
      { key: "schedule_inspection", label: "Schedule inspection visit", methods: ["GET", "POST"] },
      { key: "confirm_goods_presence", label: "Confirm goods and seals", methods: ["POST"] },
      { key: "upload_inspection_act", label: "Issue inspection act", methods: ["POST"] },
    ];
  }
  if (entity.type === "certification" || /expertiza|certificat/.test(text)) {
    return [
      { key: "submit_application", label: "Receive certificate application", methods: ["POST"] },
      { key: "issue_certificate", label: "Issue certificate artifact", methods: ["POST"] },
      { key: "return_fee_invoice", label: "Return service fee invoice", methods: ["POST"] },
    ];
  }
  if (entity.type === "transport" || /railway|airport|freight|station|transport/.test(text)) {
    return [
      { key: "reserve_transport", label: "Reserve transport capacity", methods: ["POST"] },
      { key: "issue_waybill", label: "Issue transport document", methods: ["POST"] },
      { key: "confirm_handover", label: "Confirm cargo handover", methods: ["POST"] },
    ];
  }
  if (entity.type === "facility" || /warehouse|loading|location/.test(text)) {
    return [
      { key: "confirm_availability", label: "Confirm goods availability", methods: ["POST"] },
      { key: "upload_handover_note", label: "Upload handover evidence", methods: ["POST"] },
    ];
  }
  return [
    { key: "submit_application", label: "Receive portal application", methods: ["POST"] },
    { key: "return_status", label: "Return filing status", methods: ["GET"] },
    { key: "issue_decision", label: "Issue permit or decision", methods: ["POST"] },
  ];
}

export function entityIntegrationProfile(entity: EntityLike): EntityIntegrationProfile {
  const basePath = `/api/entities/${entity.id}`;
  return {
    mode: "mock",
    entity: {
      id: entity.id,
      canonicalName: entity.canonicalName,
      type: entity.type,
      status: entity.status,
      simulationMode: Boolean(entity.simulationMode),
    },
    basePath,
    authentication: { type: "api_key", header: "x-uztrade-mock-key", value: "mock-development-key" },
    capabilities: capabilityTemplates(entity),
    endpoints: [
      { method: "GET", path: `${basePath}/integration`, purpose: "Read the mock connector profile and supported operations." },
      { method: "GET", path: `${basePath}/work-items`, purpose: "List open production-style work items assigned to this entity." },
      { method: "POST", path: `${basePath}/work-items/{workItemId}/submit`, purpose: "Submit entity-side fields, upload metadata and completion result." },
      { method: "POST", path: `${basePath}/mock-documents`, purpose: "Issue a simulated document into a case ledger." },
    ],
    mockData: { latencyMs: 250, reliability: "deterministic", environment: "sandbox" },
  };
}

function nodeFor(projection: WorkflowProjection, item: WorkItemRecord): WorkflowNodeRecord {
  const node = projection.nodes.find((candidate) => candidate.id === item.nodeId);
  if (!node) throw new Error(`Workflow node ${item.nodeId} not found`);
  return node;
}

function field(key: string, label: string, kind: FieldKind, required: boolean, value: string | null, source: SubmitField["source"]): SubmitField {
  return { key, label, kind, required, value, source };
}

function factFields(facts: ShipmentFacts): SubmitField[] {
  const quantity = facts.quantity == null ? null : `${facts.quantity}${facts.unit ? ` ${facts.unit}` : ""}`;
  return [
    field("goods", "Goods", "text", true, facts.goods || null, "case"),
    field("quantity", "Quantity", "text", false, quantity, "case"),
    field("origin", "Origin", "text", false, facts.origin, "case"),
    field("destination", "Destination", "text", false, facts.destination, "case"),
    field("mode", "Mode", "select", false, facts.mode, "case"),
  ];
}

function operationalFields(entity: EntityLike, node: WorkflowNodeRecord): SubmitField[] {
  const text = `${entity.type} ${entity.canonicalName} ${node.title} ${node.output}`.toLowerCase();
  if (/bank|payment|pay|fee/.test(text)) {
    return [
      field("paymentReference", "Payment reference", "text", true, `${node.runId.split(":").pop()}-P${node.stepNum}`, "mock"),
      field("amount", "Amount", "number", true, "245000", "mock"),
      field("paidAt", "Paid at", "date", true, "2026-09-14", "mock"),
    ];
  }
  if (/inspection|inspect|sample|quarantine|sanitary/.test(text)) {
    return [
      field("goodsLocation", "Goods location", "text", true, "Tashkent warehouse, loading bay 2", "mock"),
      field("appointmentWindow", "Appointment window", "text", true, "10:00-12:00", "mock"),
      field("inspectorName", "Inspector name", "text", true, "Mock inspector", "mock"),
      field("outcome", "Outcome", "select", true, "passed", "entity"),
    ];
  }
  if (/railway|wagon|waybill|transport|freight|airport|airline/.test(text)) {
    return [
      field("bookingReference", "Booking reference", "text", true, `TR-${node.stepNum}-2026`, "mock"),
      field("transportUnit", "Wagon / flight / vehicle", "text", true, "61234567", "mock"),
      field("handoverStatus", "Handover status", "select", true, "accepted", "entity"),
    ];
  }
  if (/certificate|origin|expertiza/.test(text)) {
    return [
      field("applicationNumber", "Application number", "text", true, `CERT-${node.stepNum}-2026`, "mock"),
      field("reviewStatus", "Review status", "select", true, "approved", "entity"),
      field("issuedAt", "Issued at", "date", true, "2026-09-14", "mock"),
    ];
  }
  return [
    field("applicationNumber", "Application number", "text", true, `APP-${node.stepNum}-2026`, "mock"),
    field("portalStatus", "Portal status", "select", true, "accepted", "entity"),
    field("notes", "Entity notes", "textarea", false, "Mock integration response", "entity"),
  ];
}

function uploadsFor(node: WorkflowNodeRecord): UploadRequest[] {
  const expected = node.output.trim();
  if (!expected) return [];
  return [
    {
      label: expected,
      required: true,
      docType: docTypeOf(expected),
      acceptedContentTypes: ["application/pdf", "image/png", "image/jpeg"],
    },
  ];
}

function referenceFor(entity: EntityLike, node: WorkflowNodeRecord, caseId: string): string {
  return `MOCK-${slug(entity.id).slice(0, 18).toUpperCase()}-${slug(caseId).toUpperCase()}-${node.stepNum}`;
}

export function entityWorkItemView(entity: EntityLike, projection: WorkflowProjection, item: WorkItemRecord): EntityWorkItemView {
  if (item.entityId !== entity.id) throw new Error(`Work item ${item.id} is not assigned to entity ${entity.id}`);
  const node = nodeFor(projection, item);
  return {
    id: item.id,
    caseId: projection.run.caseId,
    runId: item.runId,
    stepNum: node.stepNum,
    blockName: node.blockName,
    title: node.title,
    state: item.state,
    entity: { id: entity.id, canonicalName: entity.canonicalName, type: entity.type },
    form: {
      title: `${entity.canonicalName} mock submission`,
      fields: [
        field("caseReference", "Case reference", "text", true, projection.run.caseId, "case"),
        field("stepNum", "Procedure step", "number", true, String(node.stepNum), "case"),
        field("blockName", "Workflow block", "text", true, node.blockName, "case"),
        ...factFields(projection.shipmentFacts),
        ...operationalFields(entity, node),
      ],
    },
    uploads: uploadsFor(node),
    submit: { method: "POST", path: `/api/entities/${entity.id}/work-items/${item.id}/submit` },
    mockResponse: { reference: referenceFor(entity, node, projection.run.caseId), status: "ready_to_submit", expectedOutput: node.output || null },
  };
}

function uploadSummary(upload: { label: string; fileName?: string; docType?: DocType | string | null }) {
  return {
    label: upload.label,
    fileName: upload.fileName ?? `${slug(upload.label)}.pdf`,
    docType: typeof upload.docType === "string" && upload.docType in DOC_SPECS ? upload.docType : docTypeOf(upload.label),
  };
}

export async function submitEntityWorkItem(
  repository: WorkflowRepository,
  runId: string,
  entityId: string,
  workItemId: string,
  submission: EntitySubmission = {},
  options: { ai?: AgenticAiClient; portals?: PortalClient } = {},
): Promise<WorkflowProjection> {
  const projection = await repository.getProjection(runId);
  const item = projection.workItems.find((candidate) => candidate.id === workItemId);
  if (!item) throw new Error(`Work item ${workItemId} not found`);
  if (item.entityId !== entityId) throw new Error(`Work item ${workItemId} is not assigned to entity ${entityId}`);
  const node = nodeFor(projection, item);
  return completeWorkflowWorkItem(
    repository,
    workItemId,
    {
      verified: true,
      mock: true,
      outcome: typeof submission.fields?.outcome === "string" ? submission.fields.outcome : "completed",
      reference: `MOCK-${slug(entityId).slice(0, 18).toUpperCase()}-${node.stepNum}`,
      fields: submission.fields ?? {},
      uploads: (submission.uploads ?? []).map(uploadSummary),
      submittedAt: new Date().toISOString(),
    },
    entityId,
    options,
  );
}

function mockValue(field: DocField, spec: { type: DocType }, facts: ShipmentFacts, entity: EntityLike, overrides: Record<string, unknown>): string {
  const given = overrides[field.key];
  if (typeof given === "string" && given.trim()) return given.trim();
  if (typeof given === "number" && Number.isFinite(given)) return String(given);

  if (/date|issued|valid|expiry/i.test(field.key) || field.kind === "date") return field.key.includes("valid") || field.key.includes("expiry") ? "2026-12-31" : "2026-09-14";
  if (/inn/i.test(field.key) || field.kind === "inn") return "305123456";
  if (/hs|commodity/i.test(field.key) || field.kind === "hs") return "090240";
  if (/amount|total|value|cost/i.test(field.key) || field.kind === "amount") return "245000";
  if (/weight|quantity|tonnes/i.test(field.key) || field.kind === "weight") return facts.quantity ? `${facts.quantity} ${facts.unit ?? "t"}` : "60 t";
  if (/currency/i.test(field.key) || field.kind === "currency") return "USD";
  if (/country|destination/i.test(field.key) || field.kind === "country") return facts.destination ?? "Russia";
  if (/goods|cargo|product|produce|sample/i.test(field.key)) return facts.goods || "tea";
  if (/exporter|seller|shipper|sender|payer|customer|issued_to/i.test(field.key)) return "Samarkand Tea LLC";
  if (/consignee|buyer|recipient|importer/i.test(field.key)) return "Moscow Tea LLC";
  if (/station|airport|route|entry|origin|departure/i.test(field.key)) return facts.origin ?? "Tashkent";
  if (/wagon|transport|dispatch|waybill|awb|invoice|contract|cert|permit|receipt|agreement|application|protocol|poa|no$/i.test(field.key)) {
    return `${spec.type.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}-${slug(entity.id).slice(-4).toUpperCase()}-${Date.now().toString().slice(-5)}`;
  }
  return `${entity.canonicalName} mock value`;
}

function documentFields(spec: { type: DocType; fields: DocField[] }, facts: ShipmentFacts, entity: EntityLike, overrides: Record<string, unknown>): ExtractedField[] {
  return spec.fields
    .filter((field) => field.questions.length || field.anchors.length)
    .map((field) => {
      const value = mockValue(field, spec, facts, entity, overrides);
      return {
        key: field.key,
        label: field.name,
        kind: field.kind,
        required: field.required,
        value,
        normalized: value,
        confidence: 1,
        status: "confirmed",
        source: "entity_mock_api",
        alternatives: [],
      } satisfies ExtractedField;
    });
}

function requestedDocType(label: string, requested: EntityDocumentInput["docType"]): DocType | null {
  if (typeof requested === "string" && requested in DOC_SPECS) return requested as DocType;
  return docTypeOf(label);
}

export function entityMockDocumentRecord(entity: EntityLike, runId: string, facts: ShipmentFacts, input: EntityDocumentInput): DocumentRecord {
  const docType = requestedDocType(input.label, input.docType);
  if (!docType) throw new HttpError(400, `Document type is required for ${input.label}`);
  const spec = specFor(docType);
  const version = nextVersion();
  const docId = `doc-${slug(entity.id)}-${slug(input.label)}-${version}`;
  return {
    docId,
    version,
    label: input.label,
    docType,
    stepNum: input.stepNum,
    fileName: `${slug(input.label)}-${version}.pdf`,
    contentType: "application/pdf",
    size: 4096,
    r2Key: null,
    fields: documentFields(spec, facts, entity, input.fields ?? {}),
    checks: [],
    detectedType: docType,
    typeMatches: true,
    confirmed: true,
    parseError: null,
    pages: 1,
    timingsMs: 25,
    parsedAt: new Date().toISOString(),
  };
}

export async function issueEntityMockDocument(
  repository: WorkflowRepository,
  runId: string,
  entity: EntityLike,
  input: EntityDocumentInput,
): Promise<WorkflowProjection> {
  const projection = await repository.getProjection(runId);
  return recordDocument(repository, runId, entityMockDocumentRecord(entity, runId, projection.shipmentFacts, input));
}

async function requireEntity(id: string): Promise<EntityLike> {
  const { getEntity } = await import("../catalog/catalog");
  const entity = await getEntity(id);
  if (!entity) throw new HttpError(404, `Entity ${id} not found`);
  return entity as EntityLike;
}

export async function listPersistedEntityWorkItems(entityId: string): Promise<EntityWorkItemView[]> {
  const entity = await requireEntity(entityId);
  const [{ getDb }, { createD1WorkflowRepository }] = await Promise.all([
    import("../../db"),
    import("../workflow/d1-repository"),
  ]);
  const db = getDb();
  const rows = await db.select({ runId: workItems.runId }).from(workItems).where(eq(workItems.entityId, entityId));
  const repository = createD1WorkflowRepository();
  const views: EntityWorkItemView[] = [];
  for (const runId of [...new Set(rows.map((row) => row.runId))]) {
    const projection = await repository.getProjection(runId);
    for (const item of projection.workItems.filter((candidate) => candidate.entityId === entityId)) {
      views.push(entityWorkItemView(entity, projection, item));
    }
  }
  return views.sort((a, b) => a.stepNum - b.stepNum || a.id.localeCompare(b.id));
}

export async function submitPersistedEntityWorkItem(entityId: string, workItemId: string, submission: EntitySubmission = {}, options: { ai?: AgenticAiClient; portals?: PortalClient } = {}) {
  await requireEntity(entityId);
  const [{ getDb }, { createD1WorkflowRepository }, { syncCaseBlockProgress }, { buildDagProjection }] = await Promise.all([
    import("../../db"),
    import("../workflow/d1-repository"),
    import("../cases/block-progress"),
    import("../workflow/dag-projection"),
  ]);
  const [item] = await getDb().select().from(workItems).where(eq(workItems.id, workItemId)).limit(1);
  if (!item) throw new HttpError(404, `Work item ${workItemId} not found`);
  if (item.entityId !== entityId) throw new HttpError(403, `Work item ${workItemId} is not assigned to entity ${entityId}`);

  const projection = await submitEntityWorkItem(createD1WorkflowRepository(), item.runId, entityId, workItemId, submission, options);
  await syncCaseBlockProgress(projection);
  return { dag: buildDagProjection(projection), projection };
}

export async function issuePersistedEntityMockDocument(entityId: string, input: EntityDocumentInput, options: { ai?: AgenticAiClient; portals?: PortalClient } = {}) {
  if (!input.caseId) throw new HttpError(400, "caseId is required");
  const entity = await requireEntity(entityId);
  const [{ loadCase }, { syncCaseBlockProgress }] = await Promise.all([
    import("../steps/context"),
    import("../cases/block-progress"),
  ]);
  const loaded = await loadCase(input.caseId);
  const before = await loaded.repository.getProjection(loaded.runId);
  const document = entityMockDocumentRecord(entity, loaded.runId, before.shipmentFacts, input);
  const projection = await recordDocument(loaded.repository, loaded.runId, document, options);
  await syncCaseBlockProgress(projection);
  return { document, view: projection };
}
