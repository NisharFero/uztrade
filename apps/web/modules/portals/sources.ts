/* Where the agent finds each value an entity's form asks for. The entity
 * publishes its fields; the agent fills each one from the case, in order:
 *
 *   1. the step's application form (procedure 477's Single Window forms)
 *   2. a value the trader typed under the field's label (after the entity asked)
 *   3. for a reference field, the approved application it names in this case
 *   4. the field's usual sources: company profile, confirmed document fields,
 *      the intake facts, earlier entity decisions
 *
 * A field no source knows is sent empty - and the entity's answer says so.
 * Every value a field could take is kept (alternativesFor), so when an entity
 * refuses one the others can be offered (fixes.ts). */

import { parseNumber, parseTonnes } from "../documents/docai/validate";
import { specFor, type DocType } from "../documents/specs";
import { COUNTRIES } from "../intake/data/countries";
import { countryName, findPlace, toTonnes, unitsFor } from "../intake/shipment-plan";
import { commodityOf } from "../intake/taxonomy";
import type { Procedure, ProcedureStep } from "../procedures/data/procedures.generated";
import { needsOfStep } from "../procedures/requirements";
import { formOfStep, groupsOfStep, resolveForm } from "../steps/application-forms";
import { PAYMENT_AUTHORISATION } from "../steps/authorisation";
import { stepExtras } from "../workflow/tailor";
import { buildLedger, inputKey, labelKey, type Ledger } from "../steps/ledger";
import type { ShipmentFacts } from "../workflow/domain";
import type { WorkflowNodeRecord, WorkflowProjection } from "../workflow/repository";
import type { PortalField } from "./contract";
import { latestRecords, type PortalRecord } from "./records";

export type SourceContext = {
  /** The case the step belongs to - payments carry its reference. */
  caseId: string;
  procedure: Procedure;
  step: ProcedureStep;
  facts: ShipmentFacts;
  ledger: Ledger;
  nodes: WorkflowNodeRecord[];
  /** The latest entity decision per step. */
  records: PortalRecord[];
};

export type Resolved = {
  value: string;
  from: string;
  /** Read from the trader's documents - only a local model may see it. */
  document?: boolean;
} | null;
type Source = (ctx: SourceContext) => Resolved;

export function sourceContext(procedure: Procedure, step: ProcedureStep, projection: WorkflowProjection, ledger: Ledger = buildLedger(projection.artifacts)): SourceContext {
  return { caseId: projection.run.caseId, procedure, step, facts: projection.shipmentFacts, ledger, nodes: projection.nodes, records: [...latestRecords(projection).values()] };
}

/* ------------------------------------------------------------------ sources */

const given = (label: string, from = "the case"): Source => (ctx) => {
  const value = ctx.ledger.inputs.get(inputKey("value", 0, label))?.value;
  return value ? { value, from } : null;
};
const profile = (label: string) => given(label, "company profile");

/** A field of the latest document of that type - only values confirmed or read with high confidence. */
const docField = (type: DocType, key: string, map: (raw: string) => string | null = (raw) => raw): Source => (ctx) => {
  for (const doc of [...ctx.ledger.documents].reverse()) {
    if (doc.docType !== type) continue;
    const field = doc.fields.find((f) => f.key === key && f.value && (doc.confirmed || f.status === "accepted" || f.status === "confirmed"));
    const value = field?.value ? map(field.value) : null;
    if (value) return { value, from: specFor(type).name.toLowerCase(), document: true };
  }
  return null;
};

/** A document uploaded (or confirmed as provided) under a step input's label. */
const provided = (label: string): Source => (ctx) => {
  const doc = [...ctx.ledger.documents].reverse().find((d) => labelKey(d.label) === labelKey(label));
  if (doc) return { value: doc.fileName, from: "uploaded document", document: true };
  const confirmed = [...ctx.ledger.inputs.values()].find((i) => i.kind === "confirm" && labelKey(i.label) === labelKey(label));
  return confirmed ? { value: `${label} — provided`, from: "confirmed by you" } : null;
};

/** What an earlier step's entity issued: the application's reference, or one of its outputs. */
const approved = (service: string, output?: string): Source => (ctx) => {
  const hit = ctx.records
    .filter((r) => r.service === service && r.status === "approved" && r.stepNum < ctx.step.num)
    .sort((a, b) => b.stepNum - a.stepNum)[0];
  const value = hit ? (output ? hit.outputs[output] : hit.reference) : null;
  return hit && value ? { value, from: `${hit.entityName}, step ${hit.stepNum}` } : null;
};

const fromIntake = (value: string | null | undefined): Resolved => (value ? { value, from: "intake" } : null);
const countryOfPlace = (name: string | null) => {
  const place = name ? findPlace(name) : null;
  return place ? countryName(place.country) : null;
};
const placeName = (name: string | null) => (name ? findPlace(name)?.name ?? name : null);
const exporting = (ctx: SourceContext) => ctx.procedure.direction === "export";
const tonnesOf = (ctx: SourceContext) => toTonnes(ctx.facts.quantity, ctx.facts.unit, ctx.procedure.goods);
const kg = (tonnes: number | null) => (tonnes == null ? null : String(Math.round(tonnes * 1000)));
const trainMode = (ctx: SourceContext) => ctx.procedure.mode;

const hs: Source[] = [
  docField("commercial_invoice", "hs_code"),
  docField("packing_list", "hs_code"),
  (ctx) => {
    const hit = ctx.facts.goods ? commodityOf(ctx.facts.goods) : null;
    return hit?.kind === "known" ? fromIntake(hit.hs) : null;
  },
];
const goodsName: Source[] = [docField("commercial_invoice", "goods"), (ctx) => fromIntake(ctx.facts.goods)];
const mode: Source = (ctx) => fromIntake(({ train: "Rail", air: "Air", road: "Road" } as Record<string, string>)[ctx.facts.mode ?? ctx.procedure.mode]);
const partnerCountry: Source = (ctx) => fromIntake(exporting(ctx) ? null : countryOfPlace(ctx.facts.origin));
const seller: Source[] = [docField("trade_contract", "seller"), docField("commercial_invoice", "seller")];

/** The certificate-of-origin form the destination takes (country list), else CT-1 inside the CIS. */
const originForm: Source = (ctx) => {
  const place = ctx.facts.destination ? findPlace(ctx.facts.destination) : null;
  if (!place) return null;
  const profile = COUNTRIES[place.country];
  const proof = profile?.originProof ?? "";
  const cis = ["KZ", "KG", "TJ", "RU", "BY", "AM", "MD", "AZ"].includes(place.country);
  const form = /ct-?1/i.test(proof) || (!proof && cis) ? "CT-1" : /form a/i.test(proof) ? "Form A" : "General form";
  return { value: form, from: proof ? `country list — ${profile!.name}` : "destination" };
};

/** "Yes" once the payment step before this one is complete. */
const paid: Source = (ctx) => {
  const payment = ctx.nodes.filter((n) => n.stepNum < ctx.step.num && /\bpay/i.test(n.title)).sort((a, b) => b.stepNum - a.stepNum)[0];
  return payment?.state === "completed" ? { value: "Yes", from: `step ${payment.stepNum}` } : null;
};

/* ------------------------------------------------------------- payments */

/** The platform's payment reference for a step: <case>-P<step>. */
export const paymentReference = (caseId: string, stepNum: number) => `${caseId}-P${String(stepNum).padStart(2, "0")}`;

/** Fields that differ from one payment to the next - answers to them are kept per step. */
const PER_PAYMENT = /^(payment|payee|basis)\./;

const bankDetails = (ctx: SourceContext) => ctx.ledger.inputs.get(inputKey("value", 0, "Bank details"))?.value ?? "";
const fromBank = (re: RegExp): Source => (ctx) => {
  const hit = bankDetails(ctx).replace(/(\d)\s+(?=\d)/g, "$1").match(re);
  return hit ? { value: hit[1], from: "company profile — bank details" } : null;
};

type Basis = { step: ProcedureStep | null; doc: Ledger["documents"][number] | null; record: PortalRecord | null };
const basisCache = new WeakMap<SourceContext, Basis>();

/** What this payment settles: the offer agreement or invoice uploaded for it
 *  (at this step, or as the output of the step that produced it), or what an
 *  earlier entity issued (Single Window payment details). */
function basisOf(ctx: SourceContext): Basis {
  const cached = basisCache.get(ctx);
  if (cached) return cached;
  const steps = ctx.procedure.blocks.flatMap((b) => b.steps).sort((a, b) => a.num - b.num);
  const raw = needsOfStep(ctx.step, steps.filter((s) => s.num < ctx.step.num));
  const producers = raw.common.flatMap((i) => (i.producedBy ? [i.producedBy.stepNum] : []));
  const from = producers.length ? Math.min(...producers) : ctx.step.num;
  const doc =
    [...ctx.ledger.documents]
      .reverse()
      .find((d) => (d.docType === "offer_agreement" || d.docType === "invoice_for_payment") && d.stepNum >= from && d.stepNum <= ctx.step.num) ?? null;
  const record = ctx.records.filter((r) => producers.includes(r.stepNum) && r.status === "approved").sort((a, b) => b.stepNum - a.stepNum)[0] ?? null;
  const producer = producers.length ? steps.find((s) => s.num === Math.max(...producers)) ?? null : null;
  const basis = { step: producer, doc, record };
  basisCache.set(ctx, basis);
  return basis;
}

const docValue = (doc: Basis["doc"], keys: string[]) => {
  for (const key of keys) {
    const field = doc?.fields.find((f) => f.key === key && f.value && (doc.confirmed || f.status === "accepted" || f.status === "confirmed"));
    if (field?.value) return field.value;
  }
  return null;
};
const wholeNumber = (raw: string | null | undefined) => {
  const n = raw ? parseNumber(raw) : null;
  return n == null ? null : String(Math.round(n));
};

const basisAmount: Source = (ctx) => {
  const { doc, record } = basisOf(ctx);
  const onDoc = wholeNumber(docValue(doc, ["total", "amount"]));
  if (onDoc) return { value: onDoc, from: `${doc!.label}, step ${doc!.stepNum}`, document: true };
  const issued = wholeNumber(record?.outputs.amount_uzs ?? record?.outputs.amount);
  return issued ? { value: issued, from: `${record!.entityName}, step ${record!.stepNum}` } : null;
};

const paymentSum: Source = (ctx) => {
  const value = wholeNumber(given("Payment sum")(ctx)?.value);
  return value ? { value, from: "the case" } : null;
};

const PAYMENT_SOURCES: Record<string, Source[]> = {
  "payer.inn": [profile("Tax Identification Number of the organization or individual")],
  "payer.name": [profile("Name of the organization")],
  "payer.account": [fromBank(/account\s*(?:no\.?|№)?\s*(\d{20})/i), fromBank(/\b(\d{20})\b/)],
  "payer.bank_mfo": [fromBank(/mfo\s*(\d{5})/i)],
  "payee.name": [
    (ctx) => {
      const { doc, record, step } = basisOf(ctx);
      const supplier = docValue(doc, ["supplier"]);
      if (supplier) return { value: supplier, from: `${doc!.label}, step ${doc!.stepNum}`, document: true };
      if (record?.outputs.recipient) return { value: record.outputs.recipient, from: `${record.entityName}, step ${record.stepNum}` };
      if (/customs/i.test(ctx.step.title)) return { value: "Territorial customs department (treasury account)", from: "the step" };
      return step ? { value: step.entity.replace(/"/g, ""), from: `step ${step.num}` } : null;
    },
  ],
  "payee.account": [
    (ctx) => {
      const { record } = basisOf(ctx);
      return record?.outputs.account ? { value: record.outputs.account, from: `${record.entityName}, step ${record.stepNum}` } : null;
    },
  ],
  "payment.amount": [basisAmount, paymentSum],
  "basis.amount": [basisAmount],
  "basis.document": [
    (ctx) => {
      const { doc, record, step } = basisOf(ctx);
      const number = docValue(doc, ["invoice_no", "agreement_no"]);
      if (number) return { value: number, from: `${doc!.label}, step ${doc!.stepNum}`, document: true };
      if (record?.reference) return { value: record.reference, from: `${record.entityName}, step ${record.stepNum}` };
      if (doc) return { value: doc.fileName, from: `uploaded at step ${doc.stepNum}`, document: true };
      if (/customs fee/i.test(ctx.step.title)) return { value: `Customs clearance fee — ${ctx.caseId}`, from: "the step" };
      return step ? { value: `${step.output} (step ${step.num})`, from: `step ${step.num}` } : null;
    },
  ],
  "payment.purpose": [(ctx) => ({ value: `${paymentReference(ctx.caseId, ctx.step.num)} — ${stepExtras(ctx.step).publishedTitle}`, from: "payment reference" })],
  "payment.authorisation": [
    (ctx) =>
      ctx.ledger.inputs.has(inputKey("confirm", ctx.step.num, PAYMENT_AUTHORISATION))
        ? { value: "Authorised by account holder", from: "authorised by you" }
        : null,
  ],
};

const KEY_SOURCES: Record<string, Source[]> = {
  ...PAYMENT_SOURCES,

  // A step that just says "create customs declaration" takes its regime from
  // the procedure: an export declares EK10, an import IM40.
  regime: [(ctx) => ({ value: ctx.procedure.direction === "export" ? "EK10" : "IM40", from: `${ctx.procedure.direction} procedure` })],
  "applicant.inn": [given("Applicant · INN (taxpayer ID)"), profile("Tax Identification Number of the organization or individual")],
  "applicant.name": [given("Applicant · Name / organization"), profile("Name of the organization")],
  "applicant.phone": [given("Applicant · Phone"), profile("Contact phone number")],
  "applicant.email": [profile("Email")],
  "applicant.address": [given("Applicant · Address (region, street)")],
  "applicant.taxpayer": [given("Applicant · Taxpayer type"), (ctx) => (profile("Type of organization (business entity, budgetary)")(ctx) ? { value: "Company", from: "company profile" } : null)],

  "goods.name": goodsName,
  "product.name": goodsName,
  "goods.hs_code": hs,
  "product.hs": hs,
  "goods.weight_t": [docField("commercial_invoice", "quantity", (raw) => parseTonnes(raw)?.toString() ?? null), (ctx) => fromIntake(tonnesOf(ctx)?.toString())],
  "goods.net_weight_kg": [
    docField("commercial_invoice", "quantity", (raw) => kg(parseTonnes(raw))),
    docField("packing_list", "net_weight", (raw) => kg(parseTonnes(raw))),
    (ctx) => fromIntake(kg(tonnesOf(ctx))),
  ],
  "goods.gross_weight_kg": [
    docField("commercial_invoice", "gross_weight", (raw) => kg(parseTonnes(raw))),
    docField("packing_list", "gross_weight", (raw) => kg(parseTonnes(raw))),
    docField("air_waybill", "gross_weight", (raw) => kg(parseTonnes(raw))),
  ],
  "goods.origin_country": [docField("commercial_invoice", "origin_country"), (ctx) => (exporting(ctx) ? { value: "Uzbekistan", from: "export procedure" } : fromIntake(countryOfPlace(ctx.facts.origin)))],
  "product.quantity": [(ctx) => fromIntake(ctx.facts.quantity != null ? `${ctx.facts.quantity} ${ctx.facts.unit ?? "t"}` : null)],

  "shipment.departure_station": [docField("railway_bill", "departure_station"), (ctx) => fromIntake(placeName(ctx.facts.origin))],
  "general.destination_point": [given("Place of inspection (warehouse)"), (ctx) => fromIntake(exporting(ctx) ? null : placeName(ctx.facts.destination))],
  "shipment.destination_station": [docField("railway_bill", "destination_station"), (ctx) => fromIntake(placeName(ctx.facts.destination))],
  "shipment.wagons": [given("Quantity of transport units"), (ctx) => fromIntake(String(unitsFor(trainMode(ctx), ctx.procedure.goods, tonnesOf(ctx)).count))],
  "shipment.wagon_type": [
    (ctx) => {
      const kind = unitsFor(trainMode(ctx), ctx.procedure.goods, tonnesOf(ctx)).kind;
      return kind.endsWith("wagon") ? fromIntake(kind[0].toUpperCase() + kind.slice(1)) : null;
    },
  ],
  "destination.country": [(ctx) => fromIntake(countryOfPlace(ctx.facts.destination))],
  "exporter.country": [partnerCountry],
  "supplier.country": [partnerCountry],
  "transport.mode": [mode],
  "general.transport": [mode],
  "transport.document_no": [docField("railway_bill", "dispatch_no"), docField("air_waybill", "awb_no"), docField("commercial_invoice", "transport_doc")],
  "general.waybill": [docField("railway_bill", "dispatch_no"), docField("air_waybill", "awb_no")],

  "invoice.number": [docField("commercial_invoice", "invoice_no")],
  "general.invoice": [docField("commercial_invoice", "invoice_no")],
  "invoice.date": [docField("commercial_invoice", "invoice_date")],
  "invoice.total": [docField("commercial_invoice", "total_value", (raw) => parseNumber(raw)?.toString() ?? null)],
  "invoice.currency": [docField("commercial_invoice", "currency")],
  "contract.number": [
    given("Identification number of foreign trade contract"),
    docField("trade_contract", "ueisfto_id"),
    docField("trade_contract", "contract_no"),
    docField("commercial_invoice", "contract_no"),
  ],

  "origin.form": [originForm],
  "origin.criterion": [() => ({ value: "Wholly obtained", from: "agricultural goods" })],
  "evidence.land_plot": [provided("Any document confirming the exporter's right to use a land plot")],
  "evidence.purchase": [provided("Any document confirming purchase of agricultural products")],
  "payment.confirmed": [paid],
  "warehouse.license_no": [given("Warehouse license number")],

  "permits.phyto": [approved("single-window/phyto-certificate")],
  "permits.origin": [approved("single-window/origin-certificate")],
  "permits.quarantine": [approved("single-window/quarantine-permit-issue")],
  "permits.sanitary": [approved("single-window/sanitary-conclusion-issue")],
  "permits.veterinary": [approved("single-window/veterinary-permit-issue")],

  "exporter.name": [...seller, docField("veterinary_certificate", "consignor")],
  "supplier.manufacturer": [docField("food_test_report", "manufacturer"), ...seller],
  "general.psc": [docField("phytosanitary_certificate", "cert_no")],
  "product.permit": [docField("quarantine_permit", "permit_no")],
  "lab.report_no": [docField("food_test_report", "protocol_no")],
};

/* ------------------------------------------------------------------ fields */

type FormValue = { storageLabel: string; value: string | null; from: string | null };
const formCache = new WeakMap<SourceContext, Map<string, FormValue>>();
const NOT_DOCUMENTS = new Set(["company profile", "intake", "default"]);

/** The step's application form, flattened to "group.field" keys. */
function formFields(ctx: SourceContext) {
  const cached = formCache.get(ctx);
  if (cached) return cached;
  const map = new Map<string, FormValue>();
  const form = formOfStep(ctx.step.inputs);
  if (form) {
    const view = resolveForm(form, groupsOfStep(ctx.step.inputs), { ledger: ctx.ledger, facts: ctx.facts });
    for (const group of view.groups) {
      for (const field of group.fields) map.set(`${group.key}.${field.key}`, { storageLabel: field.storageLabel, value: field.value, from: field.from });
    }
  }
  formCache.set(ctx, map);
  return map;
}

/** Where a value for this field is saved when the trader types it. */
export function storageLabelFor(field: Pick<PortalField, "key" | "label">, ctx: SourceContext): string {
  const inForm = formFields(ctx).get(field.key)?.storageLabel;
  if (inForm) return inForm;
  return PER_PAYMENT.test(field.key) ? `${field.label} · step ${ctx.step.num}` : field.label;
}

type FieldRef = Pick<PortalField, "key" | "label" | "type" | "refService">;

/** Every value the case holds for a field, in the order the agent prefers them. */
export function alternativesFor(field: FieldRef, ctx: SourceContext): NonNullable<Resolved>[] {
  const hits: NonNullable<Resolved>[] = [];
  const push = (hit: Resolved) => {
    if (hit?.value && !hits.some((h) => h.value === hit.value)) hits.push(hit);
  };
  const inForm = formFields(ctx).get(field.key);
  if (inForm?.value) push({ value: inForm.value, from: inForm.from ?? "you", document: Boolean(inForm.from && !NOT_DOCUMENTS.has(inForm.from)) });
  const typed = ctx.ledger.inputs.get(inputKey("value", 0, storageLabelFor(field, ctx)))?.value;
  if (typed) push({ value: typed, from: "you" });
  if (field.type === "reference" && field.refService) push(approved(field.refService)(ctx));
  for (const source of KEY_SOURCES[field.key] ?? []) push(source(ctx));
  return hits;
}

export function resolveField(field: FieldRef, ctx: SourceContext): Resolved {
  return alternativesFor(field, ctx)[0] ?? null;
}

/** The form the agent sends: every field it has a value for, plus what the step fixes. */
export function buildFields(fields: PortalField[], ctx: SourceContext, fixed: Record<string, string> = {}) {
  const values: Record<string, string> = {};
  const sources: Record<string, string> = {};
  for (const field of fields) {
    if (fixed[field.key] != null) {
      values[field.key] = fixed[field.key];
      sources[field.key] = "the step";
      continue;
    }
    const hit = resolveField(field, ctx);
    if (hit?.value) {
      values[field.key] = hit.value;
      sources[field.key] = hit.from;
    }
  }
  return { fields: values, sources };
}
