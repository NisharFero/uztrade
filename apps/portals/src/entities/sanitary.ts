/* Sanitary-epidemiological welfare and public health committee — the
 * conclusion food, cosmetics, detergents and similar goods need before they
 * are released. Named by 24 procedures. */

import type { EntityDef } from "../contract.ts";
import { applicant, isPlantProduct, num, plusDays, type Flags } from "./common.ts";

/** Chapters the committee issues conclusions for: food, drink, cosmetics,
 *  detergents, and articles that touch food. */
const chapterOf = (hs: string | undefined) => Number((hs ?? "").slice(0, 2));
const needsConclusion = (hs: string | undefined) => {
  const chapter = chapterOf(hs);
  return isPlantProduct(hs) || (chapter >= 1 && chapter <= 24) || chapter === 33 || chapter === 34 || chapter === 39;
};

export const sanitary: EntityDef = {
  id: "sanitary",
  name: "Sanitary-epidemiological welfare and public health committee",
  site: "ses.uz",
  prefix: "SE",
  keyEnv: "PORTAL_KEY_SANITARY",
  devKey: "se-dev-key",
  services: [
    {
      id: "conclusion-invoice",
      title: "Invoice for the sanitary-epidemiological conclusion",
      kind: "obtain",
      description: "What the conclusion costs for this consignment, and where to pay it.",
      fields: [
        applicant.inn,
        applicant.name,
        { key: "goods.name", label: "Product name", type: "text", required: true },
        { key: "goods.hs_code", label: "HS code", type: "hs", digits: 4, required: true },
        { key: "goods.gross_weight_kg", label: "Quantity, kg", type: "number", min: 1, required: false },
      ],
      review: (f) => (needsConclusion(f["goods.hs_code"]) ? [] : [{ field: "goods.hs_code", reason: "A sanitary-epidemiological conclusion covers food, drink, cosmetics, detergents and food-contact goods" }]),
      issue: (app) => {
        const tonnes = num(app.fields["goods.gross_weight_kg"]) / 1000 || 1;
        const amount = Math.round((640_000 + tonnes * 12_000) / 1000) * 1000;
        return {
          invoice_no: app.reference,
          recipient: "Sanitary-epidemiological welfare and public health committee (demo)",
          account: "23402000300100002020",
          mfo: "00014",
          amount_uzs: amount.toLocaleString("en-US").replace(/,/g, " "),
          purpose: `Sanitary-epidemiological conclusion, ${app.fields["goods.name"]}`,
        };
      },
    },
    {
      id: "conclusion-application",
      title: "Application for a sanitary-epidemiological conclusion",
      kind: "apply",
      description: "Files the laboratory results and product details the conclusion is issued on.",
      fields: [
        applicant.inn,
        applicant.name,
        applicant.phone,
        { key: "goods.name", label: "Product name", type: "text", required: true },
        { key: "goods.hs_code", label: "HS code", type: "hs", digits: 4, required: true },
        { key: "supplier.manufacturer", label: "Manufacturer", type: "text", required: true },
        { key: "exporter.country", label: "Country of origin", type: "country", required: true },
        { key: "lab.report_no", label: "Laboratory test report number", type: "text", required: true, hint: "the accredited laboratory's protocol" },
        { key: "payment.confirmed", label: "Conclusion fee paid", type: "enum", options: ["Yes", "No"], required: true },
      ],
      review(f) {
        const flags: Flags = [];
        if (f["payment.confirmed"] !== "Yes") flags.push({ field: "payment.confirmed", reason: "The committee starts the review once the fee is paid" });
        if (!needsConclusion(f["goods.hs_code"])) flags.push({ field: "goods.hs_code", reason: "These goods do not need a sanitary-epidemiological conclusion" });
        return flags;
      },
      issue: (app, { now }) => ({ application_no: app.reference, review_by: plusDays(now, 5), laboratory: app.fields["lab.report_no"] }),
    },
    {
      id: "conclusion",
      title: "Sanitary-epidemiological conclusion",
      kind: "obtain",
      description: "The conclusion itself, issued on an approved application.",
      fields: [
        applicant.inn,
        { key: "ref.application", label: "Conclusion application number", type: "reference", refService: "sanitary/conclusion-application", required: true },
      ],
      issue: (app, { now }) => ({
        conclusion_no: `UZ-SES-${app.reference.slice(3)}`,
        issued: now.toISOString().slice(0, 10),
        valid_until: plusDays(now, 365),
      }),
    },
  ],
};
