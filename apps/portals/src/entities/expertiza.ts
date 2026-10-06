import type { EntityDef } from "../contract.ts";
import { applicant, plusDays } from "./common.ts";

export const expertiza: EntityDef = {
  id: "expertiza",
  name: "Uzbekexpertiza service portal",
  site: "uzexpertiza.uz",
  prefix: "UE",
  keyEnv: "PORTAL_KEY_EXPERTIZA",
  devKey: "ue-dev-key",
  services: [
    {
      id: "origin-application",
      title: "Application for certificate of origin (goods expertise)",
      kind: "apply",
      description: "Books the expertise of the goods that a certificate of origin is issued on.",
      fields: [
        applicant.inn,
        applicant.name,
        { key: "goods.name", label: "Product name", type: "text", required: true },
        { key: "goods.hs_code", label: "HS code (6 digits)", type: "hs", digits: 6, required: true, hint: "the 6-digit subheading, e.g. 090230 for black tea" },
        { key: "invoice.number", label: "Commercial invoice number", type: "text", required: true },
        { key: "invoice.date", label: "Commercial invoice date", type: "date", required: true },
        { key: "origin.criterion", label: "Origin criterion", type: "enum", options: ["Wholly obtained", "Sufficiently processed"], required: true },
        { key: "evidence.land_plot", label: "Land-plot right document", type: "text", required: false, hint: "for goods grown on the exporter's own land" },
        { key: "evidence.purchase", label: "Purchase document", type: "text", required: false, hint: "for goods bought from a farm" },
      ],
      review: (f) =>
        !f["evidence.land_plot"] && !f["evidence.purchase"]
          ? [{ field: "evidence.land_plot", reason: "Give the land-plot right document (own harvest) or the purchase document (bought from a farm)" }]
          : [],
      issue: (app, { now }) => ({
        application_no: app.reference,
        expertise_date: plusDays(now, 1),
        expertise_time: "11:00",
        expert: "Certification expert, regional branch",
      }),
    },
  ],
};
