/* Three smaller entities the corpus names online:
 *
 *   ecology     State nature protection committee — the import permit and
 *               conclusion for goods under environmental control
 *   cargo-agent the airline's cargo sales agent — the booking an air waybill
 *               is issued against
 *   edocs       electronic document management — the invoices and acceptance
 *               acts that service contracts are settled with
 */

import type { EntityDef } from "../contract.ts";
import { applicant, num, plusDays, type Flags } from "./common.ts";

export const ecology: EntityDef = {
  id: "ecology",
  name: "State nature protection committee",
  site: "eco.gov.uz",
  prefix: "EC",
  keyEnv: "PORTAL_KEY_ECOLOGY",
  devKey: "ec-dev-key",
  services: [
    {
      id: "import-permit",
      title: "Application for an environmental import permit",
      kind: "apply",
      description: "Permit for goods under environmental control — waste, chemicals, protected species and ozone-depleting substances.",
      fields: [
        applicant.inn,
        applicant.name,
        { key: "goods.name", label: "Goods", type: "text", required: true },
        { key: "goods.hs_code", label: "HS code", type: "hs", digits: 4, required: true },
        { key: "exporter.country", label: "Country of origin", type: "country", required: true },
        { key: "product.quantity", label: "Quantity and unit", type: "text", required: true },
        { key: "general.purpose_of_import", label: "Purpose of import", type: "text", required: true },
      ],
      issue: (app, { now }) => ({ application_no: app.reference, review_by: plusDays(now, 10), inspector: "Regional environmental inspectorate (demo)" }),
    },
    {
      id: "import-conclusion",
      title: "Conclusion for import",
      kind: "obtain",
      description: "The committee's conclusion, issued on an approved application.",
      fields: [
        applicant.inn,
        { key: "ref.application", label: "Permit application number", type: "reference", refService: "ecology/import-permit", required: true },
      ],
      issue: (app, { now }) => ({ conclusion_no: `UZ-ECO-${app.reference.slice(3)}`, valid_until: plusDays(now, 180) }),
    },
  ],
};

export const cargoAgent: EntityDef = {
  id: "cargo-agent",
  name: "Cargo sales agent",
  site: "cargo agent of the airline (sandbox)",
  prefix: "CA",
  keyEnv: "PORTAL_KEY_CARGO_AGENT",
  devKey: "ca-dev-key",
  services: [
    {
      id: "transport-booking",
      title: "Air transport booking",
      kind: "apply",
      description: "Books space on a flight and prices the carriage; the air waybill is issued against it.",
      fields: [
        applicant.inn,
        applicant.name,
        { key: "shipment.departure_airport", label: "Airport of departure", type: "text", required: true },
        { key: "shipment.destination_airport", label: "Airport of destination", type: "text", required: true },
        { key: "goods.name", label: "Nature of goods", type: "text", required: true },
        { key: "goods.gross_weight_kg", label: "Gross weight, kg", type: "number", min: 1, max: 120000, required: true },
        { key: "shipment.pieces", label: "Number of pieces", type: "integer", min: 1, required: true },
      ],
      review(f) {
        const flags: Flags = [];
        if (f["shipment.departure_airport"].trim().toLowerCase() === f["shipment.destination_airport"].trim().toLowerCase()) {
          flags.push({ field: "shipment.destination_airport", reason: "Departure and destination airport are the same" });
        }
        // Belly capacity on a scheduled passenger flight.
        if (num(f["goods.gross_weight_kg"]) > 20000) {
          flags.push({ field: "goods.gross_weight_kg", reason: "Over 20 t needs a main-deck freighter — ask for a charter quotation instead" });
        }
        return flags;
      },
      issue: (app, { now }) => {
        const kg = num(app.fields["goods.gross_weight_kg"]);
        return {
          booking_no: app.reference,
          flight_date: plusDays(now, 2),
          rate_per_kg_usd: "2.85",
          amount_usd: (Math.round(kg * 2.85 * 100) / 100).toFixed(2),
        };
      },
    },
    {
      id: "air-waybill",
      title: "Air waybill",
      kind: "obtain",
      description: "Issued by the agent on a paid booking.",
      fields: [
        applicant.inn,
        { key: "ref.booking", label: "Booking number", type: "reference", refService: "cargo-agent/transport-booking", required: true },
        { key: "payment.confirmed", label: "Carriage paid", type: "enum", options: ["Yes", "No"], required: true },
      ],
      review: (f) => (f["payment.confirmed"] === "Yes" ? [] : [{ field: "payment.confirmed", reason: "The air waybill is issued once the carriage is paid" }]),
      issue: (app) => ({ awb_no: `250-${app.reference.slice(-7)}`, status: "Issued" }),
    },
  ],
};

export const edocs: EntityDef = {
  id: "edocs",
  name: "Electronic document management system",
  site: "e-document exchange (sandbox)",
  prefix: "ED",
  keyEnv: "PORTAL_KEY_EDOCS",
  devKey: "ed-dev-key",
  services: [
    {
      id: "service-invoice",
      title: "Invoice for payment",
      kind: "obtain",
      description: "The invoice a service provider issues through the document exchange.",
      fields: [
        applicant.inn,
        applicant.name,
        { key: "service.name", label: "Service", type: "text", required: true },
        { key: "service.amount_uzs", label: "Amount, UZS", type: "number", min: 1, required: false },
      ],
      issue: (app) => ({
        invoice_no: app.reference,
        amount_uzs: (num(app.fields["service.amount_uzs"]) || 1_250_000).toLocaleString("en-US").replace(/,/g, " "),
        vat_rate: "12",
        purpose: app.fields["service.name"],
      }),
    },
    {
      id: "acceptance-act",
      title: "Acceptance act for completed works",
      kind: "obtain",
      description: "Signed through the exchange once the service provider reports the work done.",
      fields: [
        applicant.inn,
        { key: "ref.invoice", label: "Invoice number", type: "reference", refService: "edocs/service-invoice", required: true },
        { key: "payment.confirmed", label: "Invoice paid", type: "enum", options: ["Yes", "No"], required: true },
      ],
      review: (f) => (f["payment.confirmed"] === "Yes" ? [] : [{ field: "payment.confirmed", reason: "The act is signed after the invoice is settled" }]),
      issue: (app, { now }) => ({ act_no: app.reference, signed: now.toISOString().slice(0, 10), status: "Accepted" }),
    },
  ],
};
