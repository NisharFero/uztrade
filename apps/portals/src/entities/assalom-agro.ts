import type { EntityDef } from "../contract.ts";
import { applicant, headingMismatch, isPlantProduct, plusDays, type Flags } from "./common.ts";

export const assalomAgro: EntityDef = {
  id: "assalom-agro",
  name: "Assalom Agro",
  site: "assalomagro.uz",
  prefix: "AA",
  keyEnv: "PORTAL_KEY_ASSALOM_AGRO",
  devKey: "aa-dev-key",
  services: [
    {
      id: "internal-phyto-application",
      title: "Application for internal phytosanitary certificate",
      kind: "apply",
      description: "Books the plant quarantine inspection an internal phytosanitary certificate is issued on.",
      fields: [
        applicant.inn,
        applicant.name,
        applicant.phone,
        applicant.email,
        { key: "goods.name", label: "Product name", type: "text", required: true },
        { key: "goods.hs_code", label: "Product HS code", type: "hs", digits: 4, required: true },
        { key: "goods.weight_t", label: "Quantity, t", type: "number", min: 0.01, max: 5000, required: true },
        { key: "inspection.address", label: "Where the goods can be inspected", type: "text", required: true, hint: "warehouse or field address in Uzbekistan" },
      ],
      review(f) {
        const flags: Flags = [];
        if (!isPlantProduct(f["goods.hs_code"])) flags.push({ field: "goods.hs_code", reason: "Assalom Agro certifies plant products only (HS chapters 06–14)" });
        const mismatch = headingMismatch(f["goods.hs_code"], f["goods.name"]);
        if (mismatch) flags.push({ field: "goods.hs_code", reason: mismatch });
        return flags;
      },
      issue: (app, { now }) => ({
        application_no: app.reference,
        inspection_date: plusDays(now, 2),
        inspection_window: "10:00–12:00",
        inspection_address: app.fields["inspection.address"],
      }),
    },
    {
      id: "internal-phyto-certificate",
      title: "Internal phytosanitary certificate",
      kind: "obtain",
      description: "Issued on the application once its inspection has passed.",
      fields: [
        applicant.inn,
        { key: "ref.application", label: "Internal phytosanitary application number", type: "reference", refService: "assalom-agro/internal-phyto-application", required: true },
      ],
      issue: (app, { now }) => ({ certificate_no: `UZ-IPC-${app.reference.slice(3)}`, valid_until: plusDays(now, 30) }),
    },
  ],
};
