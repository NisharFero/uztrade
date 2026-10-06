import type { EntityDef, ServiceDef } from "../contract.ts";
import { applicant, num, plusDays, type Flags } from "./common.ts";

const WAGON_LIMIT_T = 68;
/** Sandbox exchange rate for tariffs quoted in dollars. */
const USD_RATE_UZS = 12_650;

export const railway: EntityDef = {
  id: "railway",
  name: "Uzbekistan Railways Single Window",
  site: "e-nakl.railway.uz",
  prefix: "RW",
  keyEnv: "PORTAL_KEY_RAILWAY",
  devKey: "rw-dev-key",
  services: [
    {
      id: "cost-calculation",
      title: "Cost calculation for railway services",
      kind: "obtain",
      description: "The tariff for carrying the cargo from the departure to the destination station.",
      fields: [
        applicant.inn,
        applicant.name,
        { key: "shipment.departure_station", label: "Departure station", type: "text", required: true, hint: "the station the wagons are loaded at" },
        { key: "shipment.destination_station", label: "Destination station", type: "text", required: true },
        { key: "goods.name", label: "Cargo name", type: "text", required: true },
        { key: "goods.hs_code", label: "Cargo HS code", type: "hs", digits: 4, required: true },
        { key: "goods.weight_t", label: "Cargo weight, t", type: "number", min: 0.1, max: 5000, required: true },
        { key: "shipment.wagons", label: "Number of wagons", type: "integer", min: 1, max: 100, required: true },
        { key: "shipment.wagon_type", label: "Wagon type", type: "enum", options: ["Covered wagon", "Refrigerated wagon", "Platform", "Container"], required: true },
      ],
      review(f) {
        const flags: Flags = [];
        if (f["shipment.departure_station"].toLowerCase() === f["shipment.destination_station"].toLowerCase()) {
          flags.push({ field: "shipment.destination_station", reason: "Departure and destination are the same station" });
        }
        const weight = num(f["goods.weight_t"]);
        const wagons = num(f["shipment.wagons"]);
        if (weight / wagons > WAGON_LIMIT_T) {
          flags.push({
            field: "shipment.wagons",
            reason: `${weight} t in ${wagons} wagon${wagons === 1 ? "" : "s"} is over the ${WAGON_LIMIT_T} t load limit — it needs at least ${Math.ceil(weight / WAGON_LIMIT_T)} wagons`,
          });
        }
        return flags;
      },
      issue: (app, { now }) => {
        const usd = Math.round(num(app.fields["shipment.wagons"]) * 420 + num(app.fields["goods.weight_t"]) * 18.5);
        return {
          calculation_no: app.reference,
          amount_usd: String(usd),
          // The tariff is paid in sums, at the sandbox's fixed rate.
          amount_uzs: String(usd * USD_RATE_UZS),
          valid_until: plusDays(now, 10),
        };
      },
    },
    {
      id: "arrival-notice",
      title: "Notification on freight arrival",
      kind: "obtain",
      description: "Tells the consignee the wagons have reached the destination station.",
      fields: [
        applicant.inn,
        { key: "shipment.destination_station", label: "Destination station", type: "text", required: true },
        { key: "transport.document_no", label: "Railway bill number", type: "text", required: true },
      ],
      issue: (app, { now }) => ({
        notice_no: app.reference,
        arrived_on: plusDays(now, 0),
        station: app.fields["shipment.destination_station"],
        free_time_hours: "24",
      }),
    },
    {
      id: "loading-place-notice",
      title: "Notice of the place for loading or unloading",
      kind: "apply",
      description: "Tells the station where the wagons are to be placed for loading or unloading.",
      fields: [
        applicant.inn,
        applicant.name,
        { key: "shipment.departure_station", label: "Station", type: "text", required: true },
        { key: "general.destination_point", label: "Place of loading or unloading", type: "text", required: true, hint: "branch line, siding or terminal" },
        { key: "shipment.wagons", label: "Number of wagons", type: "integer", min: 1, max: 100, required: true },
      ],
      issue: (app, { now }) => ({ notice_no: app.reference, placed_on: plusDays(now, 1), place: app.fields["general.destination_point"] }),
    },
    {
      id: "empty-wagon-return",
      title: "Application to return empty own wagons",
      kind: "apply",
      description: "Plans the return of the trader's own wagons once they are unloaded.",
      fields: [
        applicant.inn,
        applicant.name,
        { key: "transport.units", label: "Wagon numbers", type: "text", required: true },
        { key: "shipment.departure_station", label: "Station the wagons stand at", type: "text", required: true },
        { key: "shipment.destination_station", label: "Station to return them to", type: "text", required: true },
      ],
      review: (f) =>
        f["shipment.departure_station"].trim().toLowerCase() === f["shipment.destination_station"].trim().toLowerCase()
          ? [{ field: "shipment.destination_station", reason: "The wagons are already at that station" }]
          : [],
      issue: (app, { now }) => ({ application_no: app.reference, planned_for: plusDays(now, 1) }),
    },
    {
      id: "empty-wagon-bill",
      title: "Railway bill for empty own wagons",
      kind: "apply",
      description: "The consignment note the empty wagons travel back on.",
      fields: [
        applicant.inn,
        { key: "ref.empty_return", label: "Empty return application number", type: "reference", refService: "railway/empty-wagon-return", required: true },
        { key: "transport.units", label: "Wagon numbers", type: "text", required: true },
      ],
      issue: (app, { now }) => ({ dispatch_no: `EW${app.reference.slice(-6)}`, dispatched_on: plusDays(now, 0) }),
    },
    {
      id: "station-certificate",
      title: "Electronic certificate for railway station",
      kind: "obtain",
      description: "Tells the departure station the carriage is calculated and paid, so wagons can be given.",
      fields: [
        applicant.inn,
        { key: "ref.cost_calculation", label: "Cost calculation number", type: "reference", refService: "railway/cost-calculation", required: true },
        { key: "payment.confirmed", label: "Railway tariff paid", type: "enum", options: ["Yes", "No"], required: true, hint: "the amount from the cost calculation is paid" },
      ],
      review: (f) => (f["payment.confirmed"] === "No" ? [{ field: "payment.confirmed", reason: "Pay the railway tariff before the station certificate is issued" }] : []),
      issue: (app, { now, find }) => ({
        certificate_no: `ESC-${app.reference.slice(3)}`,
        departure_station: find(app.fields["ref.cost_calculation"])?.fields["shipment.departure_station"] ?? "",
        issued_on: plusDays(now, 0),
      }),
    },
    {
      id: "freight-application",
      title: "Application for freight transportation (GU-12)",
      kind: "apply",
      description: "The transportation plan: which cargo, how many wagons, from and to which station.",
      fields: [
        applicant.inn,
        applicant.name,
        { key: "shipment.departure_station", label: "Departure station", type: "text", required: true },
        { key: "shipment.destination_station", label: "Destination station", type: "text", required: true },
        { key: "goods.name", label: "Cargo name", type: "text", required: true },
        { key: "goods.weight_t", label: "Cargo weight, t", type: "number", min: 0.1, max: 5000, required: true },
        { key: "shipment.wagons", label: "Number of wagons", type: "integer", min: 1, max: 100, required: true },
      ],
      review(f) {
        const weight = num(f["goods.weight_t"]);
        const wagons = num(f["shipment.wagons"]);
        return weight / wagons > WAGON_LIMIT_T
          ? [{ field: "shipment.wagons", reason: `${weight} t needs at least ${Math.ceil(weight / WAGON_LIMIT_T)} wagons at ${WAGON_LIMIT_T} t each` }]
          : [];
      },
      issue: (app) => ({ gu12_no: `GU12-${app.reference.slice(3)}`, status: "registered" }),
    },
    formStep("freight-payment-info", "International transportation payment information (GU-12)", (app) => ({ gu12_no: `GU12-${app.reference.slice(3)}`, payer: "the forwarder named in the code notification" })),
    formStep("freight-approval", "Approved application for freight transportation (GU-12)", (app, { now }) => ({ gu12_no: `GU12-${app.reference.slice(3)}`, approved_on: plusDays(now, 0) })),
    formStep("wagon-notice", "Notification on wagons provided for loading (GU-2)", (app, { now }) => ({ gu2_no: `GU2-${app.reference.slice(3)}`, wagons_on: plusDays(now, 1) })),
    formStep("wagon-acceptance", "Acceptance of wagons (GU-45)", (app) => ({ gu45_no: `GU45-${app.reference.slice(3)}` })),
    formStep("railway-bill", "Export railway bill (SMGS)", (app) => ({ dispatch_no: `77${app.reference.replace(/\D/g, "").padStart(6, "0")}` })),
    formStep("loading-finished", "Loading or unloading finished (GU-2a)", (app) => ({ gu2a_no: `GU2A-${app.reference.slice(3)}` })),
    formStep("wagon-handover", "Handover of wagons (closed GU-45)", (app) => ({ gu45_no: `GU45-${app.reference.slice(3)}`, closed: "yes" })),
    formStep("services-confirmation", "Services actually provided (FDU-92)", (app, { now }) => ({ fdu92_no: `FDU92-${app.reference.slice(3)}`, period_end: plusDays(now, 0) })),
  ],
};

/** A railway form filed against the approved GU-12 application. */
function formStep(id: string, title: string, issue: ServiceDef["issue"]): ServiceDef {
  return {
    id,
    title,
    kind: "obtain",
    description: "Filed on the railway Single Window against the GU-12 application.",
    fields: [
      applicant.inn,
      { key: "ref.freight_application", label: "GU-12 application number", type: "reference", refService: "railway/freight-application", required: true },
    ],
    issue,
  };
}
