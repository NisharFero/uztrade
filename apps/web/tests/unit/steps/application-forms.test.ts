import assert from "node:assert/strict";
import test from "node:test";
import { PROCEDURES } from "../../../modules/procedures/sync";
import type { DocType } from "../../../modules/documents/specs";
import type { FormView } from "../../../modules/steps/application-forms";
import { inputKey, type DocumentRecord, type Ledger } from "../../../modules/steps/ledger";
import { stepViewFor, type StepView } from "../../../modules/steps/next";
import { upfrontPlan } from "../../../modules/steps/upfront";
import { instantiateWorkflow, type ShipmentFacts } from "../../../modules/workflow/domain";
import type { WorkflowProjection } from "../../../modules/workflow/repository";

const procedure = PROCEDURES["477"];
const FACTS: ShipmentFacts = { goods: "tea", quantity: 20, unit: "t", origin: "Urumqi", destination: "Tashkent", mode: "train" };

const PROFILE = {
  "Tax Identification Number of the organization or individual": "305123456",
  "Name of the organization": "Tea Import LLC",
  "Full name of an organization's manager": "A. Karimov",
  "Contact phone number": "+998 90 123 45 67",
  "Type of organization (business entity, budgetary)": "Business entity",
};

function projection(facts: ShipmentFacts = FACTS): WorkflowProjection {
  const runId = "workflow:forms";
  const workflow = instantiateWorkflow(procedure, runId);
  return {
    run: { id: runId, caseId: "T-forms", procedureVersionId: "procedure:477:v1", status: "running", cycle: 0 },
    shipmentFacts: facts,
    nodes: workflow.nodes,
    edges: workflow.edges,
    workItems: [],
    agentRuns: [],
    artifacts: [],
    auditEvents: [],
  };
}

function ledger(values: Record<string, string> = {}, documents: DocumentRecord[] = []): Ledger {
  const inputs = new Map(
    Object.entries(values).map(([label, value], i) => {
      const key = inputKey("value", 0, label);
      return [key, { key, kind: "value" as const, label, stepNum: 0, value, version: i + 1 }];
    }),
  );
  return { inputs, documents };
}

function doc(docType: DocType, fields: Record<string, string>, stepNum: number): DocumentRecord {
  return {
    docId: `doc-${docType}`,
    version: 1,
    label: docType,
    docType,
    stepNum,
    fileName: `${docType}.png`,
    contentType: "image/png",
    size: 1,
    r2Key: null,
    fields: Object.entries(fields).map(([key, value]) => ({ key, label: key, kind: "text" as const, required: false, value, normalized: value, confidence: 1, status: "confirmed" as const, source: "trader", alternatives: [] })),
    checks: [],
    detectedType: docType,
    typeMatches: true,
    confirmed: true,
    parseError: null,
    pages: 1,
    timingsMs: null,
    parsedAt: "2026-09-14T00:00:00.000Z",
  };
}

const view = (stepNum: number, l: Ledger): StepView => {
  const p = projection();
  return stepViewFor(procedure, p, l, p.nodes.find((n) => n.stepNum === stepNum)!);
};
const formOf = (v: StepView): FormView => v.needs.find((n) => n.kind === "form")!.form!;
const field = (form: FormView, group: string, key: string) => form.groups.find((g) => g.key === group)!.fields.find((f) => f.key === key);

test("step 3: the vague groups become one application with the portal's real fields", () => {
  const v = view(3, ledger());
  assert.ok(!v.needs.some((n) => /^(information about|general information)/i.test(n.label)), "no bare group labels left");
  const need = v.needs.find((n) => n.kind === "form")!;
  assert.equal(need.label, "Quarantine permit application");
  assert.deepEqual(need.form!.groups.map((g) => g.title), ["Applicant", "Importer", "Exporter", "General", "Product"]);
  assert.ok(field(need.form!, "general", "route"), "general asks for the border crossing point");
  assert.equal(v.ready, false);
  assert.ok(v.blocking.some((b) => /^Quarantine permit application — Applicant: .*INN/.test(b)), v.blocking.join(" | "));
});

test("step 3: pre-filled from the company profile and intake, with the source shown", () => {
  const form = formOf(view(3, ledger(PROFILE)));
  assert.deepEqual([field(form, "applicant", "inn")?.value, field(form, "applicant", "inn")?.from], ["305123456", "company profile"]);
  assert.equal(field(form, "applicant", "taxpayer")?.value, "Company");
  assert.deepEqual([field(form, "exporter", "country")?.value, field(form, "exporter", "country")?.from], ["China", "intake"]);
  assert.equal(field(form, "product", "hs")?.value, "0902");
  assert.equal(field(form, "general", "transport")?.value, "Rail");
  // The importer is the applicant unless the trader says otherwise.
  const importerGroup = form.groups.find((g) => g.key === "importer")!;
  assert.deepEqual(importerGroup.fields.map((f) => f.key), ["same"]);
  assert.equal(importerGroup.complete, true);
  assert.ok(form.missing.some((m) => m.startsWith("Applicant: Address")), form.missing.join(" | "));
});

test("a private person is asked for a passport; a different importer for its own details", () => {
  const form = formOf(view(3, ledger({ ...PROFILE, "Applicant · Taxpayer type": "Person", "Importer · Same as applicant": "no" })));
  assert.ok(form.groups.find((g) => g.key === "applicant")!.fields.some((f) => f.key === "passport" && f.missing));
  assert.ok(form.groups.find((g) => g.key === "importer")!.fields.some((f) => f.key === "inn" && f.missing));
});

test("step 3 is ready once the remaining details are typed", () => {
  const v = view(3, ledger({
    ...PROFILE,
    "Applicant · Address (region, street)": "Tashkent, Chilanzar 5",
    "Exporter · Name": "Xinjiang Tea Co.",
    "Exporter · Address": "Urumqi, Xinhua Rd 10",
    "General · Destination point (customs clearance place)": "Tashkent customs post",
    "General · Route (border crossing point)": "Keles",
    "General · Purpose of import": "Sale",
  }));
  const need = v.needs.find((n) => n.kind === "form")!;
  assert.equal(need.status, "have", need.form!.missing.join(" | "));
  assert.equal(need.autoFilled, true);
  assert.equal(v.blocking.some((b) => b.startsWith("Quarantine permit application")), false);
});

test("typed once, reused at steps 29 and 39; document numbers fill themselves", () => {
  const values = { ...PROFILE, "Applicant · Address (region, street)": "Tashkent, Chilanzar 5" };
  const docs = [
    doc("quarantine_permit", { permit_no: "QP-4493" }, 4),
    doc("commercial_invoice", { invoice_no: "INV-88", seller: "Xinjiang Tea Co." }, 5),
    doc("railway_bill", { dispatch_no: "SMGS-77120", wagon_no: "61234567" }, 12),
    doc("phytosanitary_certificate", { cert_no: "CN-PSC-2211" }, 20),
  ];
  const inspection = formOf(view(29, ledger(values, docs)));
  assert.deepEqual([field(inspection, "applicant", "address")?.value, field(inspection, "applicant", "address")?.from], ["Tashkent, Chilanzar 5", null]);
  assert.equal(field(inspection, "general", "psc")?.value, "CN-PSC-2211");
  assert.equal(field(inspection, "product", "permit")?.value, "QP-4493");
  assert.equal(field(inspection, "product", "wagons")?.value, "61234567");

  const sanitary = formOf(view(39, ledger(values, docs)));
  assert.deepEqual(sanitary.groups.map((g) => g.title), ["Applicant", "Importer", "Exporter", "Supplier", "General", "Payment", "Product"]);
  assert.deepEqual([field(sanitary, "general", "waybill")?.value, field(sanitary, "general", "waybill")?.from], ["SMGS-77120", "railway bill"]);
  assert.equal(field(sanitary, "general", "invoice")?.value, "INV-88");
  assert.deepEqual([field(sanitary, "exporter", "name")?.value, field(sanitary, "exporter", "name")?.from], ["Xinjiang Tea Co.", "commercial invoice"]);
  assert.equal(field(sanitary, "supplier", "country")?.value, "China");
});

test("before you start: one set of application details; general and product wait for their step", () => {
  const plan = upfrontPlan(procedure, ledger(PROFILE), FACTS);
  assert.ok(!plan.items.some((i) => /^(information about|general information|supplier information|payment information)/i.test(i.label)));
  const item = plan.items.find((i) => i.kind === "form")!;
  assert.equal(item.label, "Application details");
  assert.deepEqual(item.steps, [3, 29, 39]);
  assert.deepEqual(item.form!.groups.map((g) => g.title), ["Applicant", "Importer", "Exporter", "Supplier", "Payment"]);
  assert.equal(field(item.form!, "applicant", "inn")?.value, "305123456");
  assert.ok(plan.later.some((l) => l.label === "General — Quarantine permit application"));
  assert.ok(plan.later.some((l) => l.label === "Product — Application for sanitary-epidemiological conclusion"));
});
