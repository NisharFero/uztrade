/* Automated information system "E-tranzit" — the customs system that carries
 * goods across Uzbekistan under transit control. Named by 30 procedures, all
 * of them transit or cross-border road and rail movements. */

import type { EntityDef } from "../contract.ts";
import { applicant, headingMismatch, num, plusDays, type Flags } from "./common.ts";

/** A transit movement is guaranteed and has a delivery deadline; the system
 *  refuses a declaration it cannot control. */
const DAYS_PER_1000_KM = 3;

export const eTranzit: EntityDef = {
  id: "e-tranzit",
  name: 'Automated information system "E-tranzit"',
  site: "e-tranzit.customs.uz",
  prefix: "ET",
  keyEnv: "PORTAL_KEY_E_TRANZIT",
  devKey: "et-dev-key",
  services: [
    {
      id: "transit-declaration",
      title: "Transit declaration",
      kind: "apply",
      description: "Declares goods moving through Uzbekistan under customs control, and sets the delivery deadline.",
      fields: [
        applicant.inn,
        applicant.name,
        { key: "carrier.name", label: "Carrier", type: "text", required: true },
        { key: "transport.units", label: "Vehicle or wagon numbers", type: "text", required: true, hint: "as they appear on the transport document" },
        { key: "transport.mode", label: "Mode of transport", type: "enum", options: ["Road", "Rail", "Air"], required: true },
        { key: "general.entry_point", label: "Point of entry", type: "text", required: true },
        { key: "general.exit_point", label: "Point of exit", type: "text", required: true },
        { key: "route.distance_km", label: "Distance across Uzbekistan, km", type: "number", min: 1, max: 5000, required: false },
        { key: "goods.name", label: "Goods", type: "text", required: true },
        { key: "goods.hs_code", label: "HS code", type: "hs", digits: 4, required: true },
        { key: "goods.gross_weight_kg", label: "Gross weight, kg", type: "number", min: 1, required: true },
        { key: "transport.document_no", label: "Transport document number", type: "text", required: true, hint: "CMR, SMGS or air waybill" },
        { key: "guarantee.reference", label: "Guarantee or TIR carnet number", type: "text", required: true },
      ],
      review(f) {
        const flags: Flags = [];
        const mismatch = headingMismatch(f["goods.hs_code"], f["goods.name"]);
        if (mismatch) flags.push({ field: "goods.hs_code", reason: mismatch });
        if (f["general.entry_point"].trim().toLowerCase() === f["general.exit_point"].trim().toLowerCase()) {
          flags.push({ field: "general.exit_point", reason: "Entry and exit point are the same — that is not a transit movement" });
        }
        if (f["transport.mode"] === "Rail" && !/\d{8}/.test(f["transport.units"])) {
          flags.push({ field: "transport.units", reason: "A rail movement is controlled by 8-digit wagon numbers" });
        }
        return flags;
      },
      issue: (app, { now }) => {
        const km = num(app.fields["route.distance_km"]) || 800;
        const days = Math.max(2, Math.ceil((km / 1000) * DAYS_PER_1000_KM));
        return {
          declaration_no: app.reference,
          delivery_deadline: plusDays(now, days),
          control_point: app.fields["general.exit_point"],
          status: "Under customs control",
        };
      },
    },
    {
      id: "transit-fee",
      title: "Fees for entrance and transit",
      kind: "obtain",
      description: "What the movement owes for entering and crossing the country, and where to pay it.",
      fields: [
        applicant.inn,
        { key: "ref.transit_declaration", label: "Transit declaration number", type: "reference", refService: "e-tranzit/transit-declaration", required: true },
        { key: "goods.gross_weight_kg", label: "Gross weight, kg", type: "number", min: 1, required: true },
      ],
      issue: (app) => {
        const tonnes = num(app.fields["goods.gross_weight_kg"]) / 1000;
        const amount = Math.round((120_000 + tonnes * 9_000) / 1000) * 1000;
        return {
          invoice_no: app.reference,
          recipient: "State Customs Committee (demo)",
          account: "23402000300100001010",
          mfo: "00014",
          amount_uzs: amount.toLocaleString("en-US").replace(/,/g, " "),
          purpose: `Entrance and transit fees, ${app.fields["ref.transit_declaration"]}`,
        };
      },
    },
  ],
};
