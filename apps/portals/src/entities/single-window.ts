/* The one-stop Single Window. Procedure 477's applications use the field keys
 * of the web app's application forms (group.field), so what the trader filled
 * in there is what the portal receives. */

import type { EntityDef, FieldDef, ServiceDef } from "../contract.ts";
import { applicant, headingMismatch, isCis, isFertilizer, isPlantProduct, plusDays, type Flags } from "./common.ts";

const transport: FieldDef = { key: "general.transport", label: "Transport method", type: "enum", options: ["Rail", "Road", "Air"], required: true };
const productQuantity: FieldDef = { key: "product.quantity", label: "Quantity and unit", type: "text", required: true };
const exporterCountry: FieldDef = { key: "exporter.country", label: "Exporting country", type: "country", required: true };

/** Obtaining what an approved application was for. */
function obtain(id: string, title: string, applyService: string, issue: ServiceDef["issue"]): ServiceDef {
  return {
    id,
    title,
    kind: "obtain",
    description: `Issued on an approved “${applyService}” application.`,
    fields: [
      applicant.inn,
      { key: "ref.application", label: "Application registration number", type: "reference", refService: `single-window/${applyService}`, required: true },
    ],
    issue,
  };
}

export const singleWindow: EntityDef = {
  id: "single-window",
  name: "Single Window",
  site: "singlewindow.uz",
  prefix: "SW",
  keyEnv: "PORTAL_KEY_SINGLE_WINDOW",
  devKey: "sw-dev-key",
  services: [
    {
      id: "origin-certificate",
      title: "Certificate of origin",
      kind: "apply",
      description: "Registers the certificate of origin in the form the destination recognises.",
      fields: [
        applicant.inn,
        applicant.name,
        { key: "goods.name", label: "Product name", type: "text", required: true },
        { key: "goods.hs_code", label: "HS code (6 digits)", type: "hs", digits: 6, required: true, hint: "the 6-digit subheading" },
        { key: "invoice.number", label: "Commercial invoice number", type: "text", required: true },
        { key: "destination.country", label: "Destination country", type: "country", required: true },
        { key: "origin.form", label: "Certificate form", type: "enum", options: ["CT-1", "Form A", "General form"], required: true },
        { key: "ref.expertise", label: "Uzbekexpertiza application number", type: "reference", refService: "expertiza/origin-application", required: false },
      ],
      review(f) {
        const flags: Flags = [];
        if (isCis(f["destination.country"]) && f["origin.form"] !== "CT-1") flags.push({ field: "origin.form", reason: `${f["destination.country"]} is in the CIS free-trade area — origin is proven with form CT-1` });
        if (!isCis(f["destination.country"]) && f["origin.form"] === "CT-1") flags.push({ field: "origin.form", reason: `CT-1 is for CIS destinations — ${f["destination.country"]} takes the General form (or Form A under GSP)` });
        return flags;
      },
      issue: (app) => ({ registration_no: app.reference, certificate_no: `${app.fields["origin.form"].replace(/\s+/g, "").toUpperCase()}-UZ-${app.reference.slice(3)}`, form: app.fields["origin.form"] }),
    },
    {
      id: "phyto-certificate",
      title: "Phytosanitary certificate (export)",
      kind: "apply",
      description: "Books phytosanitary control of the consignment; the certificate follows the control.",
      fields: [
        applicant.inn,
        applicant.name,
        { key: "goods.name", label: "Product name", type: "text", required: true },
        { key: "goods.hs_code", label: "Product HS code", type: "hs", digits: 4, required: true },
        { key: "goods.weight_t", label: "Quantity, t", type: "number", min: 0.01, max: 5000, required: true },
        { key: "destination.country", label: "Destination country", type: "country", required: true },
        { key: "transport.mode", label: "Transport method", type: "enum", options: ["Rail", "Road", "Air"], required: true },
        { key: "ref.internal_phyto", label: "Internal phytosanitary certificate", type: "reference", refService: "assalom-agro/internal-phyto-certificate", required: true, hint: "issued by Assalom Agro" },
      ],
      review(f) {
        const flags: Flags = [];
        if (!isPlantProduct(f["goods.hs_code"])) flags.push({ field: "goods.hs_code", reason: "A phytosanitary certificate is for plant products (HS chapters 06–14)" });
        const mismatch = headingMismatch(f["goods.hs_code"], f["goods.name"]);
        if (mismatch) flags.push({ field: "goods.hs_code", reason: mismatch });
        return flags;
      },
      issue: (app, { now }) => ({ registration_no: app.reference, control_date: plusDays(now, 1), control_place: "Plant quarantine post at the loading station" }),
    },
    {
      id: "quarantine-permit",
      title: "Quarantine permit application",
      kind: "apply",
      description: "Permit to import goods under plant quarantine control.",
      fields: [
        { key: "applicant.taxpayer", label: "Taxpayer type", type: "enum", options: ["Company", "Person"], required: true },
        applicant.inn,
        applicant.name,
        { key: "applicant.address", label: "Applicant address", type: "text", required: true },
        applicant.phone,
        { key: "exporter.name", label: "Exporter name", type: "text", required: true },
        exporterCountry,
        { key: "exporter.address", label: "Exporter address", type: "text", required: true },
        { key: "general.destination", label: "Destination address", type: "text", required: true },
        transport,
        { key: "general.clearance", label: "Customs clearance place", type: "text", required: true },
        { key: "general.route", label: "Border crossing point", type: "text", required: true },
        { key: "general.purpose", label: "Purpose of import", type: "text", required: true },
        { key: "product.hs", label: "HS code", type: "hs", digits: 4, required: true },
        { key: "product.name", label: "Product name", type: "text", required: true },
        productQuantity,
      ],
      review(f) {
        const flags: Flags = [];
        if (/^uzbekistan$/i.test(f["exporter.country"])) flags.push({ field: "exporter.country", reason: "An import permit names the foreign exporter's country" });
        const mismatch = headingMismatch(f["product.hs"], f["product.name"]);
        if (mismatch) flags.push({ field: "product.hs", reason: mismatch });
        return flags;
      },
      issue: (app) => ({ registration_no: app.reference }),
    },
    obtain("quarantine-permit-issue", "Quarantine permit", "quarantine-permit", (app, { now }) => ({ permit_no: `QP-${app.reference.slice(3)}`, valid_until: plusDays(now, 90) })),
    {
      id: "quarantine-inspection",
      title: "Application for quarantine inspection act",
      kind: "apply",
      description: "Books the quarantine inspection of arrived goods and the opening of the transport unit.",
      fields: [
        applicant.inn,
        applicant.name,
        { key: "exporter.name", label: "Exporter name", type: "text", required: true },
        exporterCountry,
        transport,
        { key: "general.destination_point", label: "Destination point (region, post)", type: "text", required: true },
        { key: "general.psc", label: "Exporter-country phytosanitary certificate no.", type: "text", required: true },
        { key: "product.permit", label: "Quarantine permit", type: "reference", refService: "single-window/quarantine-permit-issue", required: true },
        productQuantity,
      ],
      issue: (app, { now }) => ({ registration_no: app.reference, inspection_date: plusDays(now, 1) }),
    },
    obtain("quarantine-inspection-issue", "Quarantine inspection act", "quarantine-inspection", (app, { now }) => ({ act_no: `QIA-${app.reference.slice(3)}`, issued_on: plusDays(now, 0) })),
    {
      id: "sanitary-conclusion",
      title: "Application for sanitary-epidemiological conclusion",
      kind: "apply",
      description: "Sanitary-epidemiological conclusion on imported food products.",
      fields: [
        applicant.inn,
        applicant.name,
        { key: "supplier.manufacturer", label: "Manufacturer", type: "text", required: true },
        { key: "supplier.country", label: "Supplier country", type: "country", required: true },
        { key: "general.waybill", label: "Transport waybill number", type: "text", required: true },
        { key: "general.invoice", label: "Invoice number", type: "text", required: true },
        { key: "product.hs", label: "HS code", type: "hs", digits: 4, required: true },
        { key: "product.name", label: "Product name", type: "text", required: true },
        productQuantity,
        { key: "lab.report_no", label: "Food test report number", type: "text", required: true, hint: "from the accredited laboratory's report" },
      ],
      issue: (app) => ({ registration_no: app.reference }),
    },
    obtain("sanitary-conclusion-issue", "Sanitary-epidemiological conclusion", "sanitary-conclusion", (app, { now }) => ({ conclusion_no: `SEC-${app.reference.slice(3)}`, valid_until: plusDays(now, 365) })),
    {
      id: "ecological-certificate",
      title: "Application for an ecological certificate",
      kind: "apply",
      description: "Environmental clearance filed through Single Window for goods under ecological control.",
      fields: [
        applicant.inn,
        applicant.name,
        { key: "goods.name", label: "Product name", type: "text", required: true },
        { key: "goods.hs_code", label: "HS code", type: "hs", digits: 4, required: true },
        { key: "exporter.country", label: "Country of origin", type: "country", required: true },
        productQuantity,
      ],
      issue: (app, { now }) => ({ application_no: app.reference, review_by: plusDays(now, 7) }),
    },
    {
      id: "ecological-certificate-issue",
      title: "Ecological certificate",
      kind: "obtain",
      description: "Issued on an approved ecological application.",
      fields: [
        applicant.inn,
        { key: "ref.application", label: "Ecological application number", type: "reference", refService: "single-window/ecological-certificate", required: true },
      ],
      issue: (app, { now }) => ({ certificate_no: `UZ-ECOC-${app.reference.slice(3)}`, valid_until: plusDays(now, 365) }),
    },
    {
      id: "installation-letter",
      title: "Letter of certification after installation",
      kind: "obtain",
      description: "Confirms equipment was installed and commissioned, after which the certification file is closed.",
      fields: [
        applicant.inn,
        { key: "goods.name", label: "Equipment", type: "text", required: true },
        { key: "general.destination_point", label: "Place of installation", type: "text", required: true },
      ],
      issue: (app, { now }) => ({ letter_no: app.reference, issued: now.toISOString().slice(0, 10), place: app.fields["general.destination_point"] }),
    },
    {
      id: "payment-details",
      title: "Payment details for the veterinary permit",
      kind: "obtain",
      description: "The State Committee of Veterinary's bank details and the fee to pay before applying.",
      fields: [applicant.inn, applicant.name],
      issue: (app) => ({
        recipient: "State Committee of Veterinary and Livestock Development (demo)",
        account: "20203000000000000001",
        mfo: "00014",
        purpose: `Veterinary permit fee, ${app.fields["applicant.name"]}`,
        amount_uzs: "375 000",
      }),
    },
    {
      id: "veterinary-permit",
      title: "Veterinary permit for import (application)",
      kind: "apply",
      description: "Permit to import goods under veterinary control, requested before the goods are shipped.",
      fields: [
        applicant.inn,
        applicant.name,
        applicant.phone,
        { key: "exporter.name", label: "Exporter name", type: "text", required: true },
        exporterCountry,
        transport,
        { key: "product.hs", label: "HS code", type: "hs", digits: 4, required: true },
        { key: "product.name", label: "Product name", type: "text", required: true },
        productQuantity,
        { key: "payment.confirmed", label: "Permit fee paid", type: "enum", options: ["Yes", "No"], required: true },
      ],
      review(f) {
        const flags: Flags = [];
        if (f["payment.confirmed"] === "No") flags.push({ field: "payment.confirmed", reason: "Pay the permit fee before applying" });
        if (/^uzbekistan$/i.test(f["exporter.country"])) flags.push({ field: "exporter.country", reason: "An import permit names the foreign exporter's country" });
        const mismatch = headingMismatch(f["product.hs"], f["product.name"]);
        if (mismatch) flags.push({ field: "product.hs", reason: mismatch });
        return flags;
      },
      issue: (app) => ({ registration_no: app.reference }),
    },
    obtain("veterinary-permit-issue", "Veterinary permit for import", "veterinary-permit", (app, { now }) => ({ permit_no: `VP-${app.reference.slice(3)}`, valid_until: plusDays(now, 180) })),
    {
      id: "veterinary-certificate",
      title: "Veterinary certificate Form-3 (application)",
      kind: "apply",
      description: "Books the veterinary inspection of the arrived goods; the certificate follows the inspection.",
      fields: [
        applicant.inn,
        applicant.name,
        { key: "permits.veterinary", label: "Veterinary permit", type: "reference", refService: "single-window/veterinary-permit-issue", required: true },
        { key: "product.hs", label: "HS code", type: "hs", digits: 4, required: true },
        { key: "product.name", label: "Product name", type: "text", required: true },
        productQuantity,
        { key: "general.destination_point", label: "Place of inspection (warehouse)", type: "text", required: true },
      ],
      review: (f) => (isFertilizer(f["product.hs"]) ? [] : [{ field: "product.hs", reason: "Form-3 here covers animal or vegetable fertilisers (HS 3101)" }]),
      issue: (app, { now }) => ({ registration_no: app.reference, invoice_no: `VET-INV-${app.reference.slice(3)}`, inspection_date: plusDays(now, 1) }),
    },
    obtain("veterinary-certificate-issue", "Veterinary certificate Form-3", "veterinary-certificate", (app, { now }) => ({ certificate_no: `F3-${app.reference.slice(3)}`, issued_on: plusDays(now, 0) })),
    {
      id: "conformity-certificate",
      title: "Certificate of conformity (application)",
      kind: "apply",
      description: "Asks the certification body for fertilizers to test and certify the goods.",
      fields: [
        applicant.inn,
        applicant.name,
        { key: "product.hs", label: "HS code", type: "hs", digits: 4, required: true },
        { key: "product.name", label: "Product name", type: "text", required: true },
        productQuantity,
        { key: "general.invoice", label: "Invoice number", type: "text", required: true },
        { key: "exporter.name", label: "Manufacturer / exporter", type: "text", required: true },
      ],
      review(f) {
        const mismatch = headingMismatch(f["product.hs"], f["product.name"]);
        return mismatch ? [{ field: "product.hs", reason: mismatch }] : [];
      },
      issue: (app) => ({ registration_no: app.reference }),
    },
    obtain("conformity-certificate-issue", "Certificate of conformity", "conformity-certificate", (app, { now }) => ({ certificate_no: `UZ.SMT.${app.reference.slice(3)}`, valid_until: plusDays(now, 365) })),
  ],
};
