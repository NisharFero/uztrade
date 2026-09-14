/* Risk & Compliance as values.
 *
 * Every row is title · value · reason, computed for this case from intake
 * facts, the rail/air route, the supplied country list, the procedure's rule
 * set, workflow state and the documents in the ledger. No row explains what a
 * check is in general; each says what it found. What cannot be computed
 * (inspection likelihood, duty) says so with the reason, rather than a number.
 */

import { COUNTRIES } from "../intake/data/countries";
import type { Procedure } from "../procedures/data/procedures.generated";
import type { ShipmentFacts } from "../workflow/domain";
import { assessCompliance, CERTIFICATE_RULES } from "./compliance";
import { commodityOf } from "../intake/taxonomy";
import { countryName, fmtTonnes, planRoute, resolveRoute, toTonnes, unitsFor } from "../intake/shipment-plan";
import type { Ledger } from "../steps/ledger";
import type { WorkflowProjection } from "../workflow/repository";

export type RiskStatus = "ok" | "pending" | "caution" | "high" | "unknown";
export type RiskRow = { key: string; title: string; value: string; status: RiskStatus; reason: string };
export type RiskReport = { overall: RiskRow; rows: RiskRow[] };

const SUBHEADING: Record<string, string> = {
  tea: "0902.10–0902.40 turns on green or black tea and packets of 3 kg or less",
  "dried fruits": "the subheading turns on the fruit (raisins 0806.20, apricots 0813.10, prunes 0813.20)",
  "fresh fruits and vegetables": "the heading turns on the item (tomatoes 0702, grapes 0806.10, melons 0807)",
};

const days = (hours: number) => Math.round((hours / 24) * 10) / 10;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function assessRisk(input: {
  procedure: Procedure;
  facts?: Partial<ShipmentFacts>;
  query?: string;
  projection?: WorkflowProjection | null;
  ledger?: Ledger | null;
}): RiskReport {
  const { procedure, facts = {}, query = "", projection = null, ledger = null } = input;
  const rows: RiskRow[] = [];
  const exporting = procedure.direction === "export";
  const steps = procedure.blocks.flatMap((b) => b.steps).sort((a, b) => a.num - b.num);
  const nodes = new Map((projection?.nodes ?? []).map((n) => [n.stepNum, n]));
  const docs = ledger?.documents ?? [];
  const compliance = assessCompliance(procedure, facts, query);
  const hit = commodityOf(facts.goods || query);
  const term = hit.kind === "known" && hit.category === procedure.goods ? hit.term : procedure.goods;

  /* HS classification */
  const heading = compliance.hsCode;
  const heading4 = heading.replace(/\D/g, "").slice(0, 4);
  const docCodes = docs.flatMap((d) => d.fields.filter((f) => f.key === "hs_code" && f.normalized).map((f) => ({ doc: d.label, code: String(f.normalized) })));
  const offHeading = docCodes.find((c) => heading4 && !c.code.startsWith(heading4));
  const subheadingKnown = /\d{4}\.\d{2}/.test(heading) || docCodes.some((c) => c.code.length >= 6);
  rows.push({
    key: "hs",
    title: "HS classification",
    value: docCodes.length ? `${docCodes[0].code} (${docCodes[0].doc})` : heading,
    status: offHeading ? "caution" : subheadingKnown ? "ok" : "caution",
    reason: offHeading
      ? `${offHeading.doc} gives ${offHeading.code}, outside heading ${heading4} for “${term}”`
      : docCodes.length
        ? `Within heading ${heading4} for “${term}”`
        : `“${term}” → ${heading}; ${SUBHEADING[procedure.goods] ?? "subheading not stated"} — box 33 of the declaration needs 10 digits`,
  });

  /* Procedure and route */
  const ends = resolveRoute(procedure.direction, { origin: facts.origin ?? null, destination: facts.destination ?? null }, query);
  const partnerEnd = exporting ? ends.destination : ends.origin;
  const partner = partnerEnd && !partnerEnd.assumed && partnerEnd.place.country !== "UZ" ? partnerEnd.place.country : null;
  rows.push({
    key: "procedure",
    title: "Procedure",
    value: `${procedure.id} · ${procedure.direction} by ${procedure.mode}`,
    status: "ok",
    reason:
      ends.origin && ends.destination
        ? `${ends.origin.place.name} (${countryName(ends.origin.place.country)}) → ${ends.destination.place.name} (${countryName(ends.destination.place.country)})`
        : procedure.title,
  });

  const route =
    ends.origin && ends.destination && partner ? planRoute(procedure.mode === "air" ? "air" : "train", ends.origin, ends.destination, procedure.direction) : null;
  const profile = partner ? COUNTRIES[partner] : undefined;
  if (route) {
    const via = route.via.length ? `via ${route.via.map(countryName).join(", ")}` : "direct";
    const legs = [route.gaugeBreak, route.sea, route.road].filter((l): l is string => Boolean(l));
    const crossing = profile ? (profile.crossingPoints.length ? `crossings ${profile.crossingPoints.join(", ")}` : profile.crossingNote ?? "") : "";
    rows.push({
      key: "route",
      title: "Route",
      value: `≈${route.distanceKm.toLocaleString("en-US")} km · ${via} · ${days(route.transit[0])}–${days(route.transit[1])} days`,
      status: legs.length ? "caution" : route.modelled ? "ok" : "unknown",
      reason:
        [crossing && `${profile?.name}: ${crossing}`, ...legs, !route.modelled && "corridor not modelled — distance only"].filter(Boolean).join("; ") ||
        plural(route.borders, "border crossing"),
    });
  } else {
    rows.push({
      key: "route",
      title: "Route",
      value: "Not given",
      status: "unknown",
      reason: `No ${exporting ? "destination" : "origin"} on the case — transit, crossings and origin proof can't be worked out`,
    });
  }

  /* Origin proof and destination requirements (exports) */
  if (exporting && partner) {
    rows.push({
      key: "origin_proof",
      title: "Origin proof",
      value: profile?.originProof ?? "Not in the country list",
      status: profile?.originProof ? "ok" : "unknown",
      reason: profile ? `${profile.name}${profile.eaeu ? " is an EAEU member" : ""} — per the country list` : `${countryName(partner)} has no entry in the country list`,
    });
    for (const requirement of profile?.destinationRequirements ?? []) {
      if (/animal products/i.test(requirement)) continue;
      const title = `${profile!.name} requires`;
      if (/fresh produce/i.test(requirement) && procedure.goods !== "fresh fruits and vegetables") {
        rows.push({ key: `req:${requirement}`, title, value: "Not applicable", status: "ok", reason: `“${requirement}” — the goods are ${procedure.goods}` });
      } else if (/wooden packaging/i.test(requirement)) {
        const wooden = /\b(wood(en)?|pallets?|crates?)\b/i.test(query);
        rows.push({
          key: `req:${requirement}`,
          title,
          value: wooden ? "Applies — wooden packaging stated" : "Only if packaging is wooden",
          status: wooden ? "caution" : "unknown",
          reason: wooden ? "ISPM 15 mark needed on every pallet and crate" : `“${requirement}” — packaging material isn't on the case yet`,
        });
      } else {
        rows.push({ key: `req:${requirement}`, title, value: "Required", status: "pending", reason: requirement });
      }
    }
  }

  /* Transport units */
  const tonnes = toTonnes(facts.quantity ?? null, facts.unit ?? null, procedure.goods);
  if (tonnes) {
    const units = unitsFor(procedure.mode === "air" ? "air" : "train", procedure.goods, tonnes);
    rows.push({
      key: "units",
      title: "Transport units",
      value: `${fmtTonnes(tonnes)} → ${plural(units.count, units.kind)}`,
      status: "ok",
      reason: `${units.perUnitT} t per ${units.kind}${procedure.mode === "train" ? `; offer agreements must state ${plural(units.count, "transport unit")}` : ""}`,
    });
  } else {
    rows.push({ key: "units", title: "Transport units", value: "Not given", status: "unknown", reason: "No quantity on the case" });
  }

  /* Certificates the rule set needs */
  for (const certificate of CERTIFICATE_RULES[compliance.ruleKey]?.certificates ?? []) {
    const step = steps.find((s) => s.output.toLowerCase() === certificate.toLowerCase());
    const node = step ? nodes.get(step.num) : undefined;
    const doc = docs.find((d) => d.label.toLowerCase() === certificate.toLowerCase());
    const obtained = node?.state === "completed";
    rows.push({
      key: `cert:${certificate}`,
      title: certificate,
      value: doc ? `Provided — ${doc.fileName}` : obtained ? `Obtained at step ${step!.num}` : step ? `Pending — step ${step.num}` : "Pending",
      status: doc || obtained ? "ok" : "pending",
      reason: `Required for ${procedure.goods} × ${procedure.direction}`,
    });
  }

  /* Checks across uploaded documents */
  const checks = docs.flatMap((d) => d.checks.map((c) => ({ ...c, doc: d.label })));
  const quantity = checks.filter((c) => c.check === "Quantity vs intake");
  const mismatch = quantity.find((c) => c.status === "mismatch");
  rows.push(
    quantity.length
      ? {
          key: "quantity_check",
          title: "Quantity check",
          value: (mismatch ?? quantity[0]).detail,
          status: mismatch ? "caution" : "ok",
          reason: mismatch ? `${mismatch.doc} disagrees with the quantity the case was opened with` : `${quantity[0].doc} matches intake`,
        }
      : {
          key: "quantity_check",
          title: "Quantity check",
          value: "No weight read from a document yet",
          status: "unknown",
          reason: "Compared as soon as an invoice, packing list or railway bill is read",
        },
  );
  for (const c of checks.filter((x) => x.status === "mismatch" && x.check !== "Quantity vs intake")) {
    rows.push({ key: `check:${c.doc}:${c.check}`, title: c.check, value: c.detail, status: "caution", reason: `Found on the ${c.doc.toLowerCase()}` });
  }

  /* Perishability */
  if (procedure.goods === "fresh fruits and vegetables") {
    const maxDays = route ? days(route.transit[1]) : null;
    rows.push({
      key: "perishable",
      title: "Perishability",
      value: maxDays != null ? `Up to ${maxDays} days in transit` : "Transit unknown",
      status: maxDays == null ? "unknown" : maxDays > 7 ? "high" : maxDays > 3 ? "caution" : "ok",
      reason:
        maxDays == null
          ? "No route on the case"
          : maxDays > 7
            ? "Longer than most fresh produce keeps"
            : maxDays > 3
              ? "Needs pre-cooling and an unbroken cold chain"
              : "Within a normal refrigerated-transport window",
    });
  } else {
    rows.push({ key: "perishable", title: "Perishability", value: "Shelf-stable", status: "ok", reason: `${procedure.goods} keeps for months; transit time isn't the limit` });
  }

  /* Rail through Iran */
  if (route && procedure.mode === "train" && (partner === "IR" || route.via.includes("IR"))) {
    const letter = steps.find((s) => s.inputs.includes("Islamic Republic of Iran approval letter"));
    rows.push({
      key: "iran",
      title: "Iran transit approval",
      value: letter ? `Needed at step ${letter.num}` : "Needed",
      status: "caution",
      reason: "Rail through Iran needs the Railway of Iran's approval letter",
    });
  }

  /* Not computable - said plainly */
  const red = steps.find((s) => /red corridor/i.test(s.title));
  if (red) {
    rows.push({
      key: "inspection",
      title: "Customs inspection",
      value: "Not estimated",
      status: "unknown",
      reason: `Step ${red.num} is risk-selected by customs; there is no inspection history to estimate a likelihood from`,
    });
  }
  rows.push({
    key: "duty",
    title: exporting ? "Export duty" : "Import duty and VAT",
    value: "Not computed",
    status: "unknown",
    reason: "Uzbekistan's tariff schedule hasn't been sourced — no rate is invented",
  });

  const high = rows.filter((r) => r.status === "high");
  const caution = rows.filter((r) => r.status === "caution");
  const pending = rows.filter((r) => r.status === "pending");
  const level = high.length ? "High" : caution.length ? "Caution" : "Clear";
  return {
    overall: {
      key: "overall",
      title: "Overall risk",
      value: `${level} · ${high.length + caution.length} open · ${pending.length} pending`,
      status: high.length ? "high" : caution.length ? "caution" : "ok",
      reason: [...high, ...caution].map((r) => r.title).slice(0, 3).join(", ") || "Nothing open; pending rows are certificates not obtained yet",
    },
    rows,
  };
}
