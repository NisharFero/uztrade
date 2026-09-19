/* Why each risk row exists for THIS procedure, where the agent gets what it
 * checks, and how it cross-verifies it - shown behind the "!" on the row.
 *
 * Everything here is read from the procedure itself (which step produces a
 * document, which steps ask for it) and from the document specs (which fields
 * the agent reads, which consistency checks it runs), so the explanation
 * changes with the procedure: origin proof on a tea export by train points at
 * the certificate-of-origin step of 868; on a juice export by road it says no step
 * issues one and the declaration takes one the trader already holds. */

import { docTypeOf, specFor, type DocType } from "../documents/specs";
import type { Procedure, ProcedureStep } from "../procedures/data/procedures.generated";
import type { Ledger } from "../steps/ledger";

export type ExplainSource = {
  document: string;
  /** "produced at step 39" / "asked for at steps 26, 41" / "from intake". */
  where: string;
  /** The fields the agent reads from it. */
  fields: string[];
  /** Already in this case's ledger. */
  have: boolean;
};

export type RiskExplain = {
  why: string;
  sources: ExplainSource[];
  verify: string[];
};

const stepsOf = (procedure: Procedure): ProcedureStep[] => procedure.blocks.flatMap((b) => b.steps).sort((a, b) => a.num - b.num);
const list = (nums: number[]) => (nums.length === 1 ? `step ${nums[0]}` : `steps ${nums.slice(0, 4).join(", ")}${nums.length > 4 ? "…" : ""}`);

/** Where a document of this type enters the procedure: the step producing it, or the steps asking for it. */
function whereIn(procedure: Procedure, type: DocType, label?: string): { where: string; label: string } | null {
  const steps = stepsOf(procedure);
  const matches = (text: string) => (label ? text.toLowerCase() === label.toLowerCase() : docTypeOf(text) === type);
  const produced = steps.find((s) => s.output && matches(s.output));
  if (produced) return { where: `produced at step ${produced.num} (${produced.title})`, label: produced.output };
  const asked = steps.filter((s) => s.inputs.some(matches));
  if (asked.length) return { where: `you provide it — asked for at ${list(asked.map((s) => s.num))}`, label: asked[0].inputs.find(matches) ?? label ?? specFor(type).name };
  return null;
}

function source(procedure: Procedure, ledger: Ledger | null, type: DocType, keys: string[], label?: string): ExplainSource | null {
  const found = whereIn(procedure, type, label);
  if (!found) return null;
  const spec = specFor(type);
  const fields = keys.map((k) => spec.fields.find((f) => f.key === k)?.name).filter((n): n is string => Boolean(n));
  const have = Boolean(ledger?.documents.some((d) => d.docType === type && (!label || d.label.toLowerCase() === label.toLowerCase())));
  return { document: found.label, where: found.where, fields, have };
}

const intake = (what: string[]): ExplainSource => ({ document: "Case intake", where: "from what you told the chat", fields: what, have: true });

/** The transport document this procedure's mode uses. */
function transportDoc(procedure: Procedure): DocType {
  return procedure.mode === "air" ? "air_waybill" : procedure.mode === "road" ? "cmr_note" : "railway_bill";
}

export function explainRow(key: string, procedure: Procedure, ledger: Ledger | null, extra: { certificate?: string; requirement?: string } = {}): RiskExplain | undefined {
  const exporting = procedure.direction === "export";
  const transport = transportDoc(procedure);
  const clean = (xs: (ExplainSource | null)[]) => xs.filter((x): x is ExplainSource => Boolean(x));
  const logistics = procedure.kind === "logistics";

  if (key === "hs") {
    return {
      why: logistics
        ? "Rail logistics moves the cargo; the railway still asks what it is (cargo name and code) to price the carriage, but the goods are classified in their own customs procedure."
        : `The declaration of procedure ${procedure.id} names the goods by HS code (box 33, 10 digits). The heading picks the certificate stack this procedure asks for and is what customs checks the declared goods against.`,
      sources: clean([
        intake(["Goods named at intake → HS heading"]),
        source(procedure, ledger, "commercial_invoice", ["goods", "hs_code"]),
        source(procedure, ledger, "packing_list", ["goods", "hs_code"]),
        source(procedure, ledger, "certificate_of_conformity", ["product", "hs_code"]),
      ]),
      verify: [
        "The invoice's HS code must sit inside the heading intake resolved — a code outside it is flagged",
        "The goods description on the invoice must name the same goods as intake",
        ...(procedure.kind === "customs" ? ["The declaration's commodity code is checked against the invoice before it is filed"] : []),
      ],
    };
  }
  if (key === "procedure") {
    return {
      why: `Procedure ${procedure.id} is the published route for ${procedure.goods} × ${procedure.direction} × ${procedure.mode}; its ${stepsOf(procedure).length} steps are what this case follows.`,
      sources: [intake(["Goods", "Export or import", "Transport mode", "From → To"])],
      verify: ["One end of the route must be in Uzbekistan and the other in the country list", "The direction must match the route (leaving Uzbekistan = export)"],
    };
  }
  if (key === "route") {
    const doc = specFor(transport);
    const contract = source(procedure, ledger, "trade_contract", ["incoterms"]);
    return {
      why: `The route decides how many borders ${procedure.mode === "road" ? "the trucks cross" : procedure.mode === "air" ? "the cargo crosses" : "the wagons cross"}, which crossing points apply and how long transit takes — every border adds a handover${procedure.mode === "train" ? " and a gauge change can mean transshipment" : ""}.`,
      sources: clean([
        intake(["Origin city", "Destination city"]),
        source(procedure, ledger, transport, procedure.mode === "air" ? ["departure_airport", "destination_airport"] : procedure.mode === "road" ? ["loading_place", "delivery_place"] : ["departure_station", "destination_station", "border_stations"]),
        contract,
      ]),
      verify: [
        `${doc.name}: departure and destination must match the case route`,
        ...(contract ? ["Delivery terms on the contract must fit the route (e.g. FCA at the departure point)"] : []),
      ],
    };
  }
  if (key === "origin_proof") {
    const coo = source(procedure, ledger, "certificate_of_origin", ["exporter", "consignee", "goods", "weight", "invoice_ref", "exported_to"], "Certificate of origin");
    return {
      why: !coo
        ? `The destination may ask for proof of origin, but procedure ${procedure.id} publishes no step for it — any certificate is obtained outside this procedure.`
        : coo.where.startsWith("produced")
          ? `The destination grants preferential treatment only against a certificate of origin in the form it recognises; procedure ${procedure.id} obtains it (${coo.where}) before the export declaration, which lists it as a supporting document.`
          : `The destination grants preferential treatment only against a certificate of origin in the form it recognises; procedure ${procedure.id} has no step issuing it — the export declaration takes one you already hold (${coo.where.replace(/^you provide it — /, "")}).`,
      sources: clean([
        intake(["Destination country → form (country list)"]),
        coo,
        source(procedure, ledger, "commercial_invoice", ["invoice_no", "buyer", "gross_weight", "origin_country"]),
      ]),
      verify: coo
        ? [
            "Exporter and consignee on the certificate must match the invoice seller and buyer",
            "Gross weight must match the invoice and the transport document",
            "The invoice number and date it cites must be the case's invoice",
            "The form (CT-1 inside the CIS, Form A / General form elsewhere) must be the one the country list names",
          ]
        : ["Nothing to cross-check inside this procedure"],
    };
  }
  if (key.startsWith("req:")) {
    const requirement = extra.requirement ?? "This requirement";
    const why = `“${requirement}” is listed for the destination in the supplied country list; the goods can be refused at the border without it.`;
    if (/wood|ispm/i.test(requirement)) {
      return {
        why,
        sources: clean([intake(["Destination country", "Packaging, if you mentioned it"]), source(procedure, ledger, "packing_list", ["packaging", "packages"])]),
        verify: ["The packaging material declared on the packing list decides whether ISPM 15 applies", "The treatment mark must be on every wooden pallet or crate"],
      };
    }
    if (/phytosanitary/i.test(requirement)) {
      return {
        why: procedure.goods === "fresh fruits and vegetables" ? why : `${why} It applies to fresh produce only — these goods are ${procedure.goods}.`,
        sources: clean([intake(["Destination country", "Goods"]), source(procedure, ledger, "phytosanitary_certificate", ["produce", "destination_country", "quantity"], "Phytosanitary certificate")]),
        verify: ["The certificate's destination country must be this case's destination", "Produce and quantity must match the invoice"],
      };
    }
    return { why, sources: [intake(["Destination country"])], verify: ["The requirement's document must be in the case ledger before the export declaration"] };
  }
  if (key === "units") {
    const unit = procedure.mode === "air" ? "air pallets" : procedure.mode === "road" ? "trucks" : "wagons";
    return {
      why: `The number of ${unit} is stated on offer agreements (inspection fees are charged per transport unit) and on the ${procedure.mode === "train" ? "wagon order" : "transport booking"}; it follows from the quantity.`,
      sources: clean([
        intake(["Quantity"]),
        source(procedure, ledger, "cargo_transport_application", ["tonnes", "wagons"]),
        source(procedure, ledger, transport, procedure.mode === "train" ? ["wagon_no", "weight"] : ["weight"]),
      ]),
      verify: [`${unit[0].toUpperCase()}${unit.slice(1)} ordered must carry the declared weight within the per-unit limit`, "The same count must appear on every offer agreement that asks for it"],
    };
  }
  if (key.startsWith("cert:") && extra.certificate) {
    const type = docTypeOf(extra.certificate);
    const spec = type ? specFor(type) : null;
    const step = stepsOf(procedure).find((s) => s.output.toLowerCase() === extra.certificate!.toLowerCase());
    const needs = step ? step.inputs.filter((i) => docTypeOf(i) && !/^electronic|^online/i.test(i)).slice(0, 4) : [];
    return {
      why: `Procedure ${procedure.id} requires the ${extra.certificate.toLowerCase()} for ${procedure.goods} × ${procedure.direction}${step ? `; it is issued at step ${step.num} and later steps cannot proceed without it` : ""}.`,
      sources: clean([
        step
          ? {
              document: extra.certificate,
              where: `produced at step ${step.num} (${step.title})`,
              fields: spec ? spec.fields.filter((f) => f.required).map((f) => f.name) : [],
              have: Boolean(ledger?.documents.some((d) => d.label.toLowerCase() === extra.certificate!.toLowerCase())),
            }
          : null,
        ...needs.map((label) => {
          const t = docTypeOf(label)!;
          return source(procedure, ledger, t, specFor(t).fields.filter((f) => f.required).slice(0, 3).map((f) => f.key), label);
        }),
      ]),
      verify: spec?.checks.length ? spec.checks : ["The certificate must name this case's goods and parties"],
    };
  }
  if (key === "quantity_check") {
    const invoice = source(procedure, ledger, "commercial_invoice", ["quantity", "gross_weight"]);
    const packing = source(procedure, ledger, "packing_list", ["net_weight", "gross_weight"]);
    const carriage = source(procedure, ledger, transport, procedure.mode === "air" ? ["gross_weight"] : ["weight"]);
    return {
      why: "Every document that states a weight must agree with the quantity the case was opened with; a mismatch is the most common reason customs stops a consignment.",
      sources: clean([intake(["Quantity"]), invoice, packing, carriage]),
      verify: [
        ...(invoice ? ["Invoice net weight vs intake quantity"] : []),
        ...(packing ? ["Packing list net and gross weight vs the invoice"] : []),
        ...(carriage ? [`${specFor(transport).name} weight vs the invoice gross weight`] : []),
      ].concat(invoice || packing || carriage ? [] : ["No document in this procedure states a weight"]),
    };
  }
  if (key.startsWith("check:")) {
    return {
      why: "Two documents in this case disagree on a value that customs compares.",
      sources: [],
      verify: ["Correct the document that is wrong and upload it again, or confirm the value if both are right"],
    };
  }
  if (key === "perishable") {
    return {
      why: procedure.goods === "fresh fruits and vegetables"
        ? "Fresh produce spoils in transit; the time the route takes decides whether a cold chain is enough or a nearer market is needed."
        : `${procedure.goods} keeps for months, so transit time isn't a risk for this procedure.`,
      sources: [intake(["Goods", "Route → transit days"])],
      verify: procedure.goods === "fresh fruits and vegetables" ? ["Transit days vs typical shelf life", "Refrigerated wagons ordered on the transport application"] : ["Nothing to verify"],
    };
  }
  if (key === "iran") {
    return {
      why: "The railway application for a corridor through Iran asks for the Railway of Iran's approval letter.",
      sources: clean([intake(["Route"])]),
      verify: ["The approval letter must name this cargo and wagons"],
    };
  }
  if (key === "inspection") {
    return {
      why: "Customs selects some consignments for a red-corridor inspection by risk; if selected, the goods are examined and the documents below must be at hand.",
      sources: clean([source(procedure, ledger, "commercial_invoice", ["goods", "quantity"]), source(procedure, ledger, transport, ["weight"])]),
      verify: ["The goods found must match the declaration", "Seals are re-applied and recorded on the transport document"],
    };
  }
  if (key === "duty") {
    return {
      why: logistics
        ? "Rail logistics files no declaration; duty is settled in the goods' own customs procedure."
        : exporting
          ? "Export duty depends on the product and changes with policy."
          : "Imports pay customs duty and import VAT on the customs value.",
      sources: clean([source(procedure, ledger, "commercial_invoice", ["total_value", "currency", "incoterms"])]),
      verify: ["No rate is shown: Uzbekistan's tariff schedule hasn't been sourced, so none is invented", "The customs value is the invoice value adjusted to the delivery terms"],
    };
  }
  return undefined;
}
