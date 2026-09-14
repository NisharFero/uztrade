/* Compliance & Risk agent.
 *
 * HS classification and duty treatment are an AI SUGGESTION the trader
 * confirms before filing, not a determination the platform issues. The source
 * procedures carry no HS codes and no tariff rates, so no duty rate is shown
 * (CAPABILITY_GAPS).
 *
 * What this agent states, as points:
 *   - inputs: what it needs to assess a case, why, and what it has;
 *   - unresolved: for each missing input, the conclusion it cannot reach;
 *   - risk flags, each with the evidence (documents, and the step that
 *     produces them) that must exist.
 *
 * Certificate rules are indexed by (commodity category x direction), never
 * commodity alone: tea export (868) and tea import (477) share goods and mode
 * but need disjoint certificate stacks. Country notes are advisory and
 * labelled "verify".
 */

import { COUNTRIES, COUNTRY_FIXTURE_SOURCE } from "../data/countries";
import type { Procedure, ProcedureStep } from "../data/procedures.generated";
import type { ShipmentFacts } from "../domain/workflow";
import { commodityOf } from "./intake/taxonomy";
import { stepNeeds } from "./requirements";
import { countryName, planRoute, resolveRoute, type Route } from "./shipment-plan";

export type RiskFlag = {
  label: string;
  severity: "info" | "caution" | "high";
  reason: string;
  /** Documents (with producing step) that must exist for this risk to be covered. */
  evidence: string[];
  /** Country/route rules from general practice rather than the procedure - verify. */
  advisory?: boolean;
};

export type RiskInput = { key: string; label: string; why: string; value: string | null };
export type Unresolved = { input: string; blocks: string };

export type ComplianceAssessment = {
  ruleKey: string;
  hsCode: string;
  hsHeading: string;
  vatNote: string;
  riskFlags: RiskFlag[];
  inputs: RiskInput[];
  unresolved: Unresolved[];
};

/* Standard international HS chapter/heading for each commodity in scope. */
const HS_REFERENCE: Record<string, { code: string; heading: string }> = {
  tea: { code: "0902", heading: "Tea, whether or not flavoured" },
  "dried fruits": { code: "0813", heading: "Fruit, dried, other than headings 0801 to 0806" },
  "fresh fruits and vegetables": {
    code: "0702–0810",
    heading: "Fresh or chilled vegetables and fruit (heading depends on the specific item)",
  },
};

export const CAPABILITY_GAPS: { label: string; reason: string }[] = [
  {
    label: "Duty and fee amounts",
    reason:
      "Needs Uzbekistan's HS tariff-rate schedule, which hasn't been sourced. No rate is shown rather than an invented one.",
  },
];

const EXPORT_PLANT_STACK = ["Internal phytosanitary certificate", "Phytosanitary certificate", "Certificate of origin", "Export customs declaration"];

/** (commodity category x direction) -> the certificates that must exist. Each
 *  one is the declared output of a step in the procedures the rule covers. */
export const CERTIFICATE_RULES: Record<string, { certificates: string[]; basis: string }> = {
  "tea×export": {
    certificates: EXPORT_PLANT_STACK,
    basis: "Plant product leaving Uzbekistan: domestic phytosanitary control, an export phytosanitary certificate and a certificate of origin before the export declaration.",
  },
  "dried fruits×export": {
    certificates: EXPORT_PLANT_STACK,
    basis: "Plant product leaving Uzbekistan: domestic phytosanitary control (fumigation if ordered), an export phytosanitary certificate and a certificate of origin.",
  },
  "fresh fruits and vegetables×export": {
    certificates: EXPORT_PLANT_STACK,
    basis: "Perishable plant product leaving Uzbekistan: domestic phytosanitary control, an export phytosanitary certificate and a certificate of origin — on a tight clock.",
  },
  "tea×import": {
    certificates: ["Quarantine permit", "Quarantine inspection act", "Sanitary-epidemiological conclusion", "Import customs declaration"],
    basis: "Food plant product entering Uzbekistan: a quarantine permit before arrival, quarantine inspection on arrival, and a laboratory-based sanitary-epidemiological conclusion before release.",
  },
};

/** The country fixture lists requirements per country; keep those that can
 *  apply to the goods in scope (no animal products are). */
function requirementApplies(requirement: string, goods: string): boolean {
  if (/animal products/i.test(requirement)) return false;
  if (/fresh produce/i.test(requirement)) return goods === "fresh fruits and vegetables";
  return true;
}

const stepsOf = (procedure: Procedure): ProcedureStep[] =>
  procedure.blocks.flatMap((b) => b.steps).sort((a, b) => a.num - b.num);

/** "Phytosanitary certificate — step 36" when a step produces it. */
function atStep(procedure: Procedure, document: string): string {
  const step = stepsOf(procedure).find((s) => s.output.toLowerCase() === document.toLowerCase());
  return step ? `${document} — step ${step.num}` : document;
}

function packagingIn(query: string): string | null {
  if (/\b(wood(en)?|pallets?|crates?)\b/i.test(query)) return "Wooden pallets or crates";
  if (/\b(cartons?|cardboard|boxes)\b/i.test(query)) return "Cartons";
  if (/\b(bags?|sacks?)\b/i.test(query)) return "Bags";
  return null;
}

type Facts = Partial<Pick<ShipmentFacts, "goods" | "quantity" | "unit" | "origin" | "destination">>;

export function assessCompliance(procedure: Procedure, facts: Facts = {}, query = ""): ComplianceAssessment {
  const ruleKey = `${procedure.goods}×${procedure.direction}`;
  const rule = CERTIFICATE_RULES[ruleKey];
  const steps = stepsOf(procedure);
  const exporting = procedure.direction === "export";

  /* ---- classification ---- */
  const ref = HS_REFERENCE[procedure.goods] ?? { code: "—", heading: "Not classified for this goods category" };
  const hit = commodityOf(facts.goods || query);
  const specific = hit.kind === "known" && hit.category === procedure.goods;
  const hsCode = specific ? hit.hs : ref.code;
  const hsHeading = specific && hit.term !== procedure.goods ? `${ref.heading} — ${hit.term}` : ref.heading;

  /* ---- route ---- */
  const ends = resolveRoute(procedure.direction, { origin: facts.origin ?? null, destination: facts.destination ?? null }, query);
  const partnerEnd = exporting ? ends.destination : ends.origin;
  const partner = partnerEnd && !partnerEnd.assumed && partnerEnd.place.country !== "UZ" ? partnerEnd.place.country : null;
  const route: Route | null =
    partner && ends.origin && ends.destination && procedure.mode !== "road"
      ? planRoute(procedure.mode === "air" ? "air" : "train", ends.origin, ends.destination, procedure.direction)
      : null;
  const packaging = packagingIn(query);

  /* ---- inputs the agent needs ---- */
  const inputs: RiskInput[] = [
    {
      key: "hs",
      label: "Commodity and HS heading",
      why: "Selects the rule set and the heading every customs filing is checked against.",
      value: specific ? `${hit.term} — HS ${hsCode}` : `${procedure.goods} — HS ${ref.code} (specific item not named)`,
    },
    {
      key: "direction",
      label: "Direction",
      why: "Export and import of the same goods need disjoint certificate stacks (tea: 868 vs 477).",
      value: procedure.direction,
    },
    {
      key: "mode",
      label: "Transport mode",
      why: "Decides railway bill vs air waybill and where the goods are inspected.",
      value: procedure.mode,
    },
    {
      key: "partner",
      label: exporting ? "Destination country" : "Origin country",
      why: exporting
        ? "Decides the certificate-of-origin form and the destination's plant-health rules."
        : "Decides which exporter-country phytosanitary certificate and certificate of origin to expect.",
      value: partner ? countryName(partner) : null,
    },
    {
      key: "transit",
      label: "Transit countries",
      why: "Each border adds a handover; rail via Iran needs an approval letter; a gauge break means transshipment.",
      value: route ? (route.via.length ? route.via.map(countryName).join(" → ") : "None — direct") : null,
    },
    {
      key: "quantity",
      label: "Quantity",
      why: "Sets the quantity of transport units on offer agreements and the wagons ordered.",
      value: facts.quantity ? `${facts.quantity} ${facts.unit ?? ""}`.trim() : null,
    },
    {
      key: "packaging",
      label: "Packaging material",
      why: "Wooden packaging must carry an ISPM 15 treatment mark at most destinations.",
      value: packaging,
    },
    {
      key: "perishability",
      label: "Perishability",
      why: "Sets how much clearance delay the goods tolerate.",
      value: procedure.goods === "fresh fruits and vegetables" ? "Perishable" : "Shelf-stable",
    },
  ];

  const BLOCKS: Record<string, string> = {
    partner: exporting
      ? "Which certificate-of-origin form to request, and the destination's plant-health and import rules."
      : "Which exporter-country certificates to expect with the goods.",
    transit: "Transit permits (e.g. the Iran approval letter) and gauge-break transshipment.",
    quantity: "Quantity of transport units for the offer agreements and the wagon order.",
    packaging: "Whether ISPM 15 treatment evidence is needed for wooden packaging.",
  };
  const unresolved = inputs.filter((i) => !i.value && BLOCKS[i.key]).map((i) => ({ input: i.label, blocks: BLOCKS[i.key] }));

  /* ---- risk flags with evidence ---- */
  const flags: RiskFlag[] = [];

  if (rule) {
    flags.push({
      label: exporting ? "Export certificate stack" : "Import permit stack",
      severity: "caution",
      reason: rule.basis,
      evidence: rule.certificates.map((c) => atStep(procedure, c)),
    });
  }

  const inspections = steps.filter((s) => /^undergo\b.*(phytosanitary|quarantine)/i.test(s.title));
  if (inspections.length) {
    flags.push({
      label: "Phytosanitary control required",
      severity: "caution",
      reason: "This HS chapter is subject to plant-quarantine inspection with the goods present.",
      evidence: inspections.map((s) => `${s.title} — step ${s.num} (goods present)`),
    });
  }

  if (procedure.goods === "fresh fruits and vegetables") {
    flags.push({
      label: "Perishable — time-sensitive",
      severity: "high",
      reason: "Fresh produce has no slack for clearance delay; the critical path is the whole shelf life.",
      evidence: inspections.concat(steps.filter((s) => /^loading$/i.test(s.title))).map((s) => `${s.title} — step ${s.num}`),
    });
  }

  const fumigation = steps.find((s) => /^undergo fumigation/i.test(s.title));
  if (fumigation) {
    flags.push({
      label: "Fumigation may be ordered",
      severity: "info",
      reason: "The inspector can order fumigation; it adds an offer agreement, a payment and a treatment before the certificate.",
      evidence: [`${fumigation.output} — step ${fumigation.num}`],
    });
  }

  const lab = steps.find((s) => /sanitary-epidemiological conclusion/i.test(s.output));
  if (lab) {
    flags.push({
      label: "Laboratory testing before release",
      severity: "caution",
      reason: "Samples are taken and lab-tested; release waits on the sanitary-epidemiological conclusion.",
      evidence: [
        ...steps.filter((s) => s.inputs.some((i) => /food test report/i.test(i))).map(() => "Food test report from international accredited laboratories"),
        `${lab.output} — step ${lab.num}`,
      ],
    });
  }

  if (!exporting) {
    flags.push({
      label: "Import duty and VAT apply",
      severity: "info",
      reason: "Imports into Uzbekistan are ordinarily subject to customs duty and import VAT on this heading.",
      evidence: [atStep(procedure, "Import customs declaration")],
    });
  } else {
    flags.push({
      label: "Verify export duty treatment",
      severity: "info",
      reason: "Export duty treatment varies by product and changes with policy; confirm before filing.",
      evidence: [atStep(procedure, "Export customs declaration")],
    });
  }

  const originApply = steps.find((s) => /^apply for certificate of origin$/i.test(s.title));
  if (originApply) {
    const supporting = stepNeeds(procedure, originApply.num).common.filter((i) => i.kind === "case").map((i) => i.label);
    flags.push({
      label: "Certificate of origin required",
      severity: "info",
      reason: "A preferential-tariff claim at destination needs this certificate; Uzbekexpertiza examines the goods before issuing it.",
      evidence: [atStep(procedure, "Certificate of origin"), ...supporting],
    });
  }

  const redCorridor = steps.find((s) => /red corridor/i.test(s.title));
  if (redCorridor) {
    const docs = stepNeeds(procedure, redCorridor.num).common.filter((i) => i.docType).map((i) => i.label);
    flags.push({
      label: "Customs may select a red-corridor inspection",
      severity: "info",
      reason: "Risk-selected, not certain. If selected, the goods are examined and these documents must be at hand.",
      evidence: docs,
    });
  }

  /* ---- country notes, from the supplied country fixture (advisory) ---- */
  if (partner) {
    const profile = COUNTRIES[partner];
    if (profile) {
      const crossing = profile.crossingPoints.length
        ? `Crossing points: ${profile.crossingPoints.join(", ")}.`
        : profile.crossingNote
          ? `Route: ${profile.crossingNote}.`
          : "";
      const originProof = exporting && profile.originProof ? [`${profile.originProof} — ${atStep(procedure, "Certificate of origin")}`] : [];
      const requirements = exporting ? profile.destinationRequirements.filter((r) => requirementApplies(r, procedure.goods)) : [];
      flags.push({
        label: `${profile.name}${profile.eaeu ? " — EAEU member" : ""}`,
        severity: "info",
        advisory: true,
        reason: [profile.originProof ? `Origin proof: ${profile.originProof}.` : "", crossing, `${COUNTRY_FIXTURE_SOURCE}.`].filter(Boolean).join(" "),
        evidence: [...originProof, ...requirements],
      });
    } else {
      flags.push({
        label: `${countryName(partner)} — not in the country list`,
        severity: "caution",
        advisory: true,
        reason: "No origin proof, crossing points or destination requirements are recorded for this country.",
        evidence: [],
      });
    }
  }

  if (route && procedure.mode === "train" && (partner === "IR" || route.via.includes("IR"))) {
    const letterStep = steps.find((s) => s.inputs.includes("Islamic Republic of Iran approval letter"));
    flags.push({
      label: "Rail routed through Iran",
      severity: "caution",
      reason: "The railway application for this corridor asks for an approval letter from the Islamic Republic of Iran.",
      evidence: [letterStep ? `Islamic Republic of Iran approval letter — step ${letterStep.num}` : "Islamic Republic of Iran approval letter"],
    });
  }
  if (route?.gaugeBreak) {
    flags.push({
      label: "Break of gauge on the route",
      severity: "info",
      advisory: true,
      reason: `${route.gaugeBreak}: goods are transshipped or bogies changed, so seals may be re-checked.`,
      evidence: [atStep(procedure, "Export railway bill (SMGS)")],
    });
  }
  if (packaging === "Wooden pallets or crates") {
    flags.push({
      label: "Wooden packaging — ISPM 15",
      severity: "caution",
      advisory: true,
      reason: "Wood packaging material must be heat-treated or fumigated and carry the ISPM 15 mark at most destinations.",
      evidence: ["ISPM 15 mark on each pallet or crate", "Packing list declaring the packaging material"],
    });
  }

  return {
    ruleKey,
    hsCode,
    hsHeading,
    vatNote: "Uzbekistan applies a standard VAT rate to most imports; confirm current rate and any exemptions with the State Customs Committee.",
    riskFlags: flags,
    inputs,
    unresolved,
  };
}
