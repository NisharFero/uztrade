/* State centre for expertise and standardization of medicines, medical devices
 * and medical equipment — and its public register. Named by the pharmaceutical
 * and medical-equipment procedures. */

import type { EntityDef } from "../contract.ts";
import { applicant, plusDays, type Flags } from "./common.ts";

/** HS chapter 30 is pharmaceuticals; 90 covers medical instruments and
 *  apparatus. The centre registers those. */
const isMedicinal = (hs: string | undefined) => /^30/.test(hs ?? "") || /^90/.test(hs ?? "");

export const medicines: EntityDef = {
  id: "medicines",
  name: "State centre for expertise and standardization of medicines and medical devices",
  site: "uzpharm-control.uz",
  prefix: "MD",
  keyEnv: "PORTAL_KEY_MEDICINES",
  devKey: "md-dev-key",
  services: [
    {
      id: "registration-check",
      title: "State registration check",
      kind: "obtain",
      description: "Whether a pharmaceutical or medical product is already on the state register.",
      fields: [
        { key: "goods.name", label: "Product name", type: "text", required: true },
        { key: "goods.hs_code", label: "HS code", type: "hs", digits: 4, required: true },
        { key: "supplier.manufacturer", label: "Manufacturer", type: "text", required: true },
      ],
      review: (f) => (isMedicinal(f["goods.hs_code"]) ? [] : [{ field: "goods.hs_code", reason: "The centre registers medicines (HS 30) and medical devices (HS 90)" }]),
      issue: (app, { now }) => ({
        register_entry: `UZ-REG-${app.reference.slice(3)}`,
        registered: "Yes",
        checked_on: now.toISOString().slice(0, 10),
        product: app.fields["goods.name"],
      }),
    },
    {
      id: "services-contract",
      title: "Contract for registration services",
      kind: "obtain",
      description: "The contract the centre concludes before it examines a product dossier.",
      fields: [applicant.inn, applicant.name, { key: "goods.name", label: "Product name", type: "text", required: true }],
      issue: (app, { now }) => ({
        contract_no: app.reference,
        concluded: now.toISOString().slice(0, 10),
        amount_uzs: "4 500 000",
        purpose: `Expertise and registration, ${app.fields["goods.name"]}`,
      }),
    },
    {
      id: "registration-application",
      title: "Application for a registration certificate",
      kind: "apply",
      description: "The dossier a medicine or medical device is registered on.",
      fields: [
        applicant.inn,
        applicant.name,
        applicant.email,
        { key: "goods.name", label: "Product name", type: "text", required: true },
        { key: "goods.hs_code", label: "HS code", type: "hs", digits: 4, required: true },
        { key: "supplier.manufacturer", label: "Manufacturer", type: "text", required: true },
        { key: "exporter.country", label: "Country of manufacture", type: "country", required: true },
        { key: "ref.contract", label: "Services contract number", type: "reference", refService: "medicines/services-contract", required: true },
        { key: "dossier.quality", label: "Quality dossier reference", type: "text", required: true, hint: "the manufacturer's quality file" },
        { key: "payment.confirmed", label: "Expertise fee paid", type: "enum", options: ["Yes", "No"], required: true },
      ],
      review(f) {
        const flags: Flags = [];
        if (!isMedicinal(f["goods.hs_code"])) flags.push({ field: "goods.hs_code", reason: "Registration covers medicines (HS 30) and medical devices (HS 90)" });
        if (f["payment.confirmed"] !== "Yes") flags.push({ field: "payment.confirmed", reason: "The expertise starts once the fee is paid" });
        return flags;
      },
      issue: (app, { now }) => ({ application_no: app.reference, expertise_by: plusDays(now, 20), stage: "Dossier under expertise" }),
    },
    {
      id: "registration-certificate",
      title: "Registration certificate",
      kind: "obtain",
      description: "Issued when the expertise finds the dossier complete.",
      fields: [
        applicant.inn,
        { key: "ref.application", label: "Registration application number", type: "reference", refService: "medicines/registration-application", required: true },
      ],
      issue: (app, { now }) => ({
        certificate_no: `UZ-MED-${app.reference.slice(3)}`,
        issued: now.toISOString().slice(0, 10),
        valid_until: plusDays(now, 1825),
      }),
    },
  ],
};
