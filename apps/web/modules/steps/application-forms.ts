/* Single Window applications behind the vague "Information about …" inputs of
 * procedure 477 (steps 3, 29 and 39).
 *
 * The procedure document lists only group names ("Information about
 * applicant", "General information", …) and shows a placeholder icon as their
 * specimen. The fields below are read from the portal screenshots embedded in
 * the same document (sections 7-8): the quarantine permit application, the
 * application for a quarantine inspection act, and the application for a
 * sanitary-epidemiological conclusion.
 *
 * Each field is stored once for the case as "<Group> · <Field>", so what the
 * trader types for step 3 also fills steps 29 and 39. Fields the case already
 * knows - company profile, intake, confirmed document fields - are pre-filled
 * and say where they came from. */

import type { DocType } from "../documents/specs";
import { commodityOf } from "../intake/taxonomy";
import { countryName, findPlace } from "../intake/shipment-plan";
import type { ShipmentFacts } from "../workflow/domain";
import { inputKey, labelKey, type Ledger } from "./ledger";

export type GroupKey = "applicant" | "importer" | "exporter" | "general" | "product" | "supplier" | "payment";
export type FormFieldKind = "text" | "date" | "select" | "checkbox";

/** A value and where it came from; `from` is null when the trader typed it. */
type Resolved = { value: string; from: string | null } | null;
export type PrefillContext = { ledger: Ledger; facts: ShipmentFacts };
type Reader = (fieldKey: string) => string | null;

export type FormFieldDef = {
  key: string;
  label: string;
  kind: FormFieldKind;
  required: boolean;
  options?: string[];
  hint?: string;
  /** Shown only when this holds, e.g. passport fields for a private person. */
  showIf?: (read: Reader) => boolean;
  prefill?: (ctx: PrefillContext) => Resolved;
};

export type GroupDef = { key: GroupKey; title: string; /** The procedure's own wording. */ label: string; fields: FormFieldDef[] };
export type FormDef = { id: string; title: string; portal: string; application: RegExp; groups: GroupDef[] };

export type FormFieldView = {
  key: string;
  storageLabel: string;
  label: string;
  kind: FormFieldKind;
  options: string[];
  required: boolean;
  hint: string | null;
  value: string | null;
  from: string | null;
  missing: boolean;
};
export type FormGroupView = { key: GroupKey; title: string; sourceLabel: string; fields: FormFieldView[]; filled: number; total: number; complete: boolean };
export type FormView = { id: string; title: string; portal: string; groups: FormGroupView[]; complete: boolean; missing: string[]; prefilled: number };

/* ------------------------------------------------------------ pre-fill sources */

const EMPTY_FACTS: ShipmentFacts = { goods: "", quantity: null, unit: null, origin: null, destination: null, mode: null };

const profile = (label: string) => (ctx: PrefillContext): Resolved => {
  const value = ctx.ledger.inputs.get(inputKey("value", 0, label))?.value;
  return value ? { value, from: "company profile" } : null;
};

const DOC_NAME: Partial<Record<DocType, string>> = {
  trade_contract: "foreign trade contract",
  commercial_invoice: "commercial invoice",
  packing_list: "packing list",
  railway_bill: "railway bill",
  quarantine_permit: "quarantine permit",
  phytosanitary_certificate: "exporter's phytosanitary certificate",
  food_test_report: "food test report",
};

/** A field from the latest document of that type - only values that were confirmed or read with high confidence. */
const fromDoc = (type: DocType, key: string) => (ctx: PrefillContext): Resolved => {
  for (const doc of [...ctx.ledger.documents].reverse()) {
    if (doc.docType !== type) continue;
    const field = doc.fields.find((f) => f.key === key && f.value && (doc.confirmed || f.status === "accepted" || f.status === "confirmed"));
    if (field?.value) return { value: field.value, from: DOC_NAME[type] ?? type.replace(/_/g, " ") };
  }
  return null;
};

const first = (...sources: ((ctx: PrefillContext) => Resolved)[]) => (ctx: PrefillContext): Resolved => {
  for (const source of sources) {
    const hit = source(ctx);
    if (hit) return hit;
  }
  return null;
};

const cityCountry = (name: string | null) => {
  const place = name ? findPlace(name) : null;
  return place ? countryName(place.country) : null;
};

const intake = {
  destination: (ctx: PrefillContext): Resolved => (ctx.facts.destination ? { value: ctx.facts.destination, from: "intake" } : null),
  originCountry: (ctx: PrefillContext): Resolved => {
    const country = cityCountry(ctx.facts.origin);
    return country ? { value: country, from: "intake" } : null;
  },
  mode: (ctx: PrefillContext): Resolved => {
    const mode = ({ train: "Rail", air: "Air", road: "Road" } as Record<string, string>)[ctx.facts.mode ?? ""];
    return mode ? { value: mode, from: "intake" } : null;
  },
  hs: (ctx: PrefillContext): Resolved => {
    const hit = ctx.facts.goods ? commodityOf(ctx.facts.goods) : null;
    return hit?.kind === "known" ? { value: hit.hs, from: "intake" } : null;
  },
  goods: (ctx: PrefillContext): Resolved => (ctx.facts.goods ? { value: ctx.facts.goods, from: "intake" } : null),
  quantity: (ctx: PrefillContext): Resolved =>
    ctx.facts.quantity != null ? { value: `${ctx.facts.quantity}${ctx.facts.unit ? ` ${ctx.facts.unit}` : ""}`, from: "intake" } : null,
};

/* ------------------------------------------------------------------- groups */

const isPerson = (read: Reader) => read("taxpayer") === "Person";

function party(withPassport: boolean, fromProfile: boolean): FormFieldDef[] {
  const pf = (label: string) => (fromProfile ? profile(label) : undefined);
  return [
    {
      key: "taxpayer", label: "Taxpayer type", kind: "select", options: ["Company", "Person"], required: true,
      prefill: fromProfile ? (ctx) => (profile("Type of organization (business entity, budgetary)")(ctx) ? { value: "Company", from: "company profile" } : null) : undefined,
    },
    { key: "inn", label: "INN (taxpayer ID)", kind: "text", required: true, prefill: pf("Tax Identification Number of the organization or individual") },
    { key: "name", label: "Name / organization", kind: "text", required: true, prefill: pf("Name of the organization") },
    { key: "director", label: "Director's full name", kind: "text", required: false, prefill: pf("Full name of an organization's manager") },
    { key: "address", label: "Address (region, street)", kind: "text", required: true },
    { key: "phone", label: "Phone", kind: "text", required: true, prefill: pf("Contact phone number") },
    { key: "fax", label: "Fax", kind: "text", required: false },
    ...(withPassport
      ? ([
          { key: "passport", label: "Passport series and number", kind: "text", required: true, showIf: isPerson },
          { key: "passport_date", label: "Passport issue date", kind: "date", required: true, showIf: isPerson },
          { key: "passport_by", label: "Passport issued by", kind: "text", required: true, showIf: isPerson },
          { key: "patent", label: "Patent (guvohnoma) number", kind: "text", required: false, showIf: isPerson },
          { key: "patent_date", label: "Patent issue date", kind: "date", required: false, showIf: isPerson },
        ] satisfies FormFieldDef[])
      : []),
  ];
}

const applicant = (withPassport: boolean): GroupDef => ({ key: "applicant", title: "Applicant", label: "Information about applicant", fields: party(withPassport, true) });

const importer = (withPassport: boolean): GroupDef => ({
  key: "importer",
  title: "Importer",
  label: "Information about importer",
  fields: [
    { key: "same", label: "Same as applicant", kind: "checkbox", required: false, prefill: () => ({ value: "yes", from: "default" }) },
    // The portal asks for importer details only when they differ from the applicant's.
    ...party(withPassport, false).map((f) => ({ ...f, showIf: (read: Reader) => read("same") !== "yes" && (f.showIf ? f.showIf(read) : true) })),
  ],
});

const exporterName = first(fromDoc("trade_contract", "seller"), fromDoc("commercial_invoice", "seller"));

const exporter = (withCountry: boolean): GroupDef => ({
  key: "exporter",
  title: "Exporter",
  label: "Information about exporter",
  fields: [
    { key: "name", label: "Name", kind: "text", required: true, prefill: exporterName },
    ...(withCountry ? ([{ key: "country", label: "Exporting country", kind: "text", required: true, prefill: intake.originCountry }] satisfies FormFieldDef[]) : []),
    { key: "address", label: "Address", kind: "text", required: true },
  ],
});

const transport: FormFieldDef = { key: "transport", label: "Transport method", kind: "select", options: ["Rail", "Road", "Air"], required: true, prefill: intake.mode };
const hs: FormFieldDef = { key: "hs", label: "HS code", kind: "text", required: true, prefill: first(fromDoc("commercial_invoice", "hs_code"), intake.hs) };
const productName: FormFieldDef = { key: "name", label: "Product name", kind: "text", required: true, prefill: first(fromDoc("commercial_invoice", "goods"), intake.goods) };
const quantity: FormFieldDef = { key: "quantity", label: "Quantity and unit", kind: "text", required: true, prefill: intake.quantity };

export const APPLICATION_FORMS: FormDef[] = [
  {
    id: "quarantine_permit",
    title: "Quarantine permit application",
    portal: "Single Window",
    application: /^quarantine permit application$/i,
    groups: [
      applicant(true),
      importer(true),
      exporter(true),
      {
        key: "general",
        title: "General",
        label: "General information",
        fields: [
          { key: "destination", label: "Destination address", kind: "text", required: true, prefill: intake.destination },
          { key: "transit_from", label: "Transit from (country)", kind: "text", required: false },
          { key: "transit_to", label: "Transit to (country)", kind: "text", required: false },
          transport,
          { key: "clearance", label: "Destination point (customs clearance place)", kind: "text", required: true },
          { key: "route", label: "Route (border crossing point)", kind: "text", required: true, hint: "Border post the goods enter through" },
          { key: "purpose", label: "Purpose of import", kind: "text", required: true, hint: "e.g. sale, processing" },
        ],
      },
      {
        key: "product",
        title: "Product",
        label: "Information about product",
        fields: [hs, productName, quantity, { key: "gross", label: "Gross weight", kind: "text", required: false, prefill: first(fromDoc("commercial_invoice", "gross_weight"), fromDoc("packing_list", "gross_weight")) }],
      },
    ],
  },
  {
    id: "quarantine_inspection",
    title: "Application for quarantine inspection act",
    portal: "Single Window",
    application: /^online application for quarantine inspection certificate$/i,
    groups: [
      applicant(false),
      importer(false),
      exporter(true),
      {
        key: "general",
        title: "General",
        label: "General information",
        fields: [
          transport,
          { key: "destination_point", label: "Destination point (region, post)", kind: "text", required: true },
          { key: "psc", label: "Exporter-country phytosanitary certificate no.", kind: "text", required: true, prefill: fromDoc("phytosanitary_certificate", "cert_no") },
        ],
      },
      {
        key: "product",
        title: "Product",
        label: "Information about product",
        fields: [
          { key: "permit", label: "Quarantine permit number", kind: "text", required: true, prefill: fromDoc("quarantine_permit", "permit_no") },
          quantity,
          { key: "wagons", label: "Wagon / container numbers", kind: "text", required: false, prefill: fromDoc("railway_bill", "wagon_no") },
        ],
      },
    ],
  },
  {
    id: "sanitary_conclusion",
    title: "Application for sanitary-epidemiological conclusion",
    portal: "Single Window",
    application: /^online application for sanitary-epidemiolog/i,
    groups: [
      applicant(false),
      importer(false),
      exporter(false),
      {
        key: "supplier",
        title: "Supplier",
        label: "Supplier information",
        fields: [
          { key: "manufacturer", label: "Manufacturer / producing organization", kind: "text", required: true, prefill: first(fromDoc("food_test_report", "manufacturer"), exporterName) },
          { key: "country", label: "Supplier country", kind: "text", required: true, prefill: intake.originCountry },
        ],
      },
      {
        key: "general",
        title: "General",
        label: "General information",
        fields: [
          { key: "waybill", label: "Transport waybill number", kind: "text", required: true, prefill: fromDoc("railway_bill", "dispatch_no") },
          { key: "contract", label: "Contract number", kind: "text", required: false, prefill: first(fromDoc("trade_contract", "contract_no"), fromDoc("commercial_invoice", "contract_no")) },
          { key: "invoice", label: "Invoice number", kind: "text", required: true, prefill: fromDoc("commercial_invoice", "invoice_no") },
          { key: "location", label: "Where the goods are now", kind: "text", required: false },
        ],
      },
      {
        key: "payment",
        title: "Payment",
        label: "Payment information",
        fields: [
          { key: "bank", label: "Bank name", kind: "text", required: false, hint: "The bank paying for the conclusion" },
          { key: "account", label: "Settlement account number", kind: "text", required: false },
        ],
      },
      {
        key: "product",
        title: "Product",
        label: "Information about product",
        fields: [
          hs,
          productName,
          { key: "batch", label: "Batch number", kind: "text", required: false },
          quantity,
          { key: "valid_from", label: "Shelf life from", kind: "date", required: false },
          { key: "valid_to", label: "Shelf life to", kind: "date", required: false },
          { key: "origin", label: "Country of origin", kind: "text", required: false, prefill: first(fromDoc("commercial_invoice", "origin_country"), intake.originCountry) },
        ],
      },
    ],
  },
];

/* ---------------------------------------------------------------- resolving */

const GROUP_OF_LABEL: Record<string, GroupKey> = {
  "information about applicant": "applicant",
  "information about importer": "importer",
  "information about exporter": "exporter",
  "general information": "general",
  "information about product": "product",
  "supplier information": "supplier",
  "payment information": "payment",
};

/** "Information about applicant" -> "applicant"; null for any other input. */
export const groupOfLabel = (label: string): GroupKey | null => GROUP_OF_LABEL[labelKey(label)] ?? null;

/** The portal application a step fills in, if its inputs name one. */
export const formOfStep = (inputs: string[]): FormDef | null => APPLICATION_FORMS.find((f) => inputs.some((i) => f.application.test(i))) ?? null;

/** The groups a step's inputs ask for, in the procedure's order. */
export const groupsOfStep = (inputs: string[]): GroupKey[] => [...new Set(inputs.map(groupOfLabel).filter((g): g is GroupKey => Boolean(g)))];

export const storageLabel = (group: Pick<GroupDef, "title">, field: Pick<FormFieldDef, "label">) => `${group.title} · ${field.label}`;

export function resolveGroup(group: GroupDef, ctx: PrefillContext): FormGroupView {
  const values = new Map<string, Resolved>();
  for (const field of group.fields) {
    const saved = ctx.ledger.inputs.get(inputKey("value", 0, storageLabel(group, field)))?.value;
    values.set(field.key, saved ? { value: saved, from: null } : field.prefill?.(ctx) ?? null);
  }
  const read: Reader = (key) => values.get(key)?.value ?? null;
  const fields: FormFieldView[] = group.fields
    .filter((field) => !field.showIf || field.showIf(read))
    .map((field) => {
      const resolved = values.get(field.key) ?? null;
      return {
        key: field.key,
        storageLabel: storageLabel(group, field),
        label: field.label,
        kind: field.kind,
        options: field.options ?? [],
        required: field.required,
        hint: field.hint ?? null,
        value: resolved?.value ?? null,
        from: resolved?.from ?? null,
        missing: field.required && !resolved?.value,
      };
    });
  const counted = fields.filter((f) => f.kind !== "checkbox");
  return {
    key: group.key,
    title: group.title,
    sourceLabel: group.label,
    fields,
    filled: counted.filter((f) => f.value).length,
    total: counted.length,
    complete: fields.every((f) => !f.missing),
  };
}

export function formView(id: string, title: string, portal: string, groups: FormGroupView[]): FormView {
  const missing = groups.filter((g) => !g.complete).map((g) => `${g.title}: ${g.fields.filter((f) => f.missing).map((f) => f.label).join(", ")}`);
  const prefilled = groups.reduce((n, g) => n + g.fields.filter((f) => f.value && f.from && f.from !== "default").length, 0);
  return { id, title, portal, groups, complete: missing.length === 0, missing, prefilled };
}

export function resolveForm(def: FormDef, groupKeys: GroupKey[], ctx: Partial<PrefillContext> & { ledger: Ledger }): FormView {
  const full: PrefillContext = { ledger: ctx.ledger, facts: ctx.facts ?? EMPTY_FACTS };
  const groups = def.groups.filter((g) => groupKeys.includes(g.key)).map((g) => resolveGroup(g, full));
  return formView(def.id, def.title, def.portal, groups);
}

/** Who the applications are about: known before the case starts, the same on every application. */
export const PARTY_GROUPS: GroupKey[] = ["applicant", "importer", "exporter", "supplier", "payment"];

/** One definition per party group, fields combined across the applications that use it (first wording wins). */
export function mergedPartyGroups(forms: { def: FormDef; groupKeys: GroupKey[] }[]): GroupDef[] {
  const merged = new Map<GroupKey, GroupDef>();
  for (const { def, groupKeys } of forms) {
    for (const group of def.groups) {
      if (!groupKeys.includes(group.key) || !PARTY_GROUPS.includes(group.key)) continue;
      const into = merged.get(group.key) ?? { ...group, fields: [] };
      for (const field of group.fields) if (!into.fields.some((f) => f.label === field.label)) into.fields.push(field);
      merged.set(group.key, into);
    }
  }
  return PARTY_GROUPS.filter((key) => merged.has(key)).map((key) => merged.get(key)!);
}
