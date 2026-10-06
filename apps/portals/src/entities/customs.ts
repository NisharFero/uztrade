import { REFERENCE, type EntityDef } from "../contract.ts";
import { applicant, headingMismatch, isPlantProduct, num, plusDays, type Flags } from "./common.ts";

const PERMITS: [string, string][] = [
  ["permits.phyto", "phytosanitary certificate"],
  ["permits.origin", "certificate of origin"],
  ["permits.quarantine", "quarantine permit"],
  ["permits.sanitary", "sanitary-epidemiological conclusion"],
];

const ddmmyyyy = (now: Date) => now.toISOString().slice(0, 10).split("-").reverse().join("");

export const customs: EntityDef = {
  id: "customs",
  name: "Customs personal cabinet (foreign economic activity)",
  site: "cabinet.customs.uz",
  prefix: "CU",
  keyEnv: "PORTAL_KEY_CUSTOMS",
  devKey: "cu-dev-key",
  services: [
    {
      id: "preliminary-inspection",
      title: "Application for preliminary visual inspection",
      kind: "apply",
      description: "Books the visual inspection of imported goods at the customs warehouse.",
      fields: [
        applicant.inn,
        applicant.name,
        { key: "warehouse.license_no", label: "Warehouse license number", type: "text", required: true },
        { key: "transport.document_no", label: "Railway bill number", type: "text", required: true },
        { key: "invoice.number", label: "Commercial invoice number", type: "text", required: true },
        { key: "goods.name", label: "Goods description", type: "text", required: true },
        { key: "goods.weight_t", label: "Weight, t", type: "number", min: 0.01, max: 5000, required: true },
      ],
      issue: (app, { now }) => ({ registration_no: app.reference, inspection_date: plusDays(now, 1) }),
    },
    {
      id: "declaration",
      title: "Customs declaration",
      kind: "apply",
      description: "The electronic customs declaration: export (EK10), release for domestic use (IM40) or customs warehouse (IM70).",
      fields: [
        { key: "regime", label: "Customs regime", type: "enum", options: ["EK10", "IM40", "IM70"], required: true },
        applicant.inn,
        applicant.name,
        { key: "contract.number", label: "Foreign trade contract ID", type: "text", required: true, hint: "the contract's identification number" },
        { key: "invoice.number", label: "Invoice number", type: "text", required: true },
        { key: "invoice.date", label: "Invoice date", type: "date", required: true },
        { key: "invoice.total", label: "Invoice total", type: "number", min: 0.01, required: true },
        { key: "invoice.currency", label: "Invoice currency", type: "enum", options: ["USD", "EUR", "CNY", "RUB", "KZT", "UZS"], required: true },
        { key: "goods.name", label: "Goods description", type: "text", required: true },
        { key: "goods.hs_code", label: "HS code (10 digits)", type: "hs", digits: 10, required: true, hint: "the full national commodity code" },
        { key: "goods.net_weight_kg", label: "Net weight, kg", type: "number", min: 1, required: true },
        { key: "goods.gross_weight_kg", label: "Gross weight, kg", type: "number", min: 1, required: true },
        { key: "goods.origin_country", label: "Country of origin", type: "country", required: true },
        { key: "destination.country", label: "Destination country", type: "country", required: true, when: { field: "regime", equals: "EK10" } },
        { key: "transport.mode", label: "Transport method", type: "enum", options: ["Rail", "Road", "Air"], required: true },
        { key: "transport.document_no", label: "Transport document number", type: "text", required: true, hint: "railway bill or air waybill" },
        { key: "permits.phyto", label: "Phytosanitary certificate number", type: "text", required: false },
        { key: "permits.origin", label: "Certificate of origin number", type: "text", required: false },
        { key: "permits.quarantine", label: "Quarantine permit number", type: "text", required: false },
        { key: "permits.sanitary", label: "Sanitary-epidemiological conclusion number", type: "text", required: false },
      ],
      review(f, { find }) {
        const flags: Flags = [];
        if (num(f["goods.net_weight_kg"]) > num(f["goods.gross_weight_kg"])) {
          flags.push({ field: "goods.net_weight_kg", reason: `Net weight ${f["goods.net_weight_kg"]} kg is more than the gross weight ${f["goods.gross_weight_kg"]} kg` });
        }
        const mismatch = headingMismatch(f["goods.hs_code"], f["goods.name"]);
        if (mismatch) flags.push({ field: "goods.hs_code", reason: mismatch });
        if (isPlantProduct(f["goods.hs_code"])) {
          if (f.regime === "EK10" && !f["permits.phyto"]) flags.push({ field: "permits.phyto", reason: "Plant products are exported with a phytosanitary certificate — give its number" });
          if (f.regime === "IM40" && !f["permits.quarantine"]) flags.push({ field: "permits.quarantine", reason: "Plant products are released with a quarantine permit — give its number" });
        }
        for (const [key, what] of PERMITS) {
          const reference = f[key];
          if (!reference || !REFERENCE.test(reference)) continue;
          if (find(reference)?.status !== "approved") flags.push({ field: key, reason: `${reference} is not an approved ${what} application in the registry` });
        }
        return flags;
      },
      issue: (app, { now }) => ({ declaration_no: `26001/${ddmmyyyy(now)}/${app.reference.slice(-6)}`, regime: app.fields.regime }),
    },
    {
      id: "declaration-release",
      title: "Released customs declaration",
      kind: "obtain",
      description: "The declaration as released by the customs post.",
      fields: [applicant.inn, { key: "ref.declaration", label: "Declaration application number", type: "reference", refService: "customs/declaration", required: true }],
      issue(app, { now, find }) {
        const declaration = find(app.fields["ref.declaration"]);
        const regime = declaration?.fields.regime ?? "";
        return {
          declaration_no: declaration?.outputs.declaration_no ?? "",
          regime,
          status: regime === "EK10" ? "Released for export" : regime === "IM70" ? "Placed in customs warehouse" : "Released for domestic use",
          released_on: plusDays(now, 0),
        };
      },
    },
  ],
};
