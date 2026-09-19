/* Which entity API an online step is filed with. Matched on the published
 * entity and the step's wording, so the same rule serves every procedure
 * (the export declaration is step 41 in 868 and step 39 in 540). A payment to
 * a bank goes through the payment gateway; paying anyone else stays with the
 * trader. */

import type { ProcedureStep } from "../procedures/data/procedures.generated";
import type { PortalEntityId } from "./contract";

export type PortalTarget = {
  entity: PortalEntityId;
  service: string;
  /** Values the step itself decides, e.g. the customs regime. */
  fixed: Record<string, string>;
};

const target = (entity: PortalEntityId, service: string, fixed: Record<string, string> = {}): PortalTarget => ({ entity, service, fixed });

/** A bank transfer the agent can make through the payment gateway. */
export const GATEWAY_PAYEE = /^bank$|online banking system/i;

const RULES: [entity: RegExp, title: RegExp, PortalTarget][] = [
  [GATEWAY_PAYEE, /^(pay|prepay)\s/i, target("payments", "transfer", { "payment.currency": "UZS" })],
  [/railways single window/i, /cost calculation/i, target("railway", "cost-calculation")],
  [/railways single window/i, /electronic certificate for railway station/i, target("railway", "station-certificate")],
  [/railways single window/i, /^apply for freight transportation/i, target("railway", "freight-application")],
  [/railways single window/i, /additional information on payment/i, target("railway", "freight-payment-info")],
  [/railways single window/i, /^obtain approved application for freight/i, target("railway", "freight-approval")],
  [/railways single window/i, /notification on wagons/i, target("railway", "wagon-notice")],
  [/railways single window/i, /^confirm acceptance of wagons/i, target("railway", "wagon-acceptance")],
  [/railways single window/i, /^submit export railway bill/i, target("railway", "railway-bill")],
  [/railways single window/i, /finishing loading/i, target("railway", "loading-finished")],
  [/railways single window/i, /^confirm handover of wagons/i, target("railway", "wagon-handover")],
  [/railways single window/i, /services actually provided/i, target("railway", "services-confirmation")],
  [/assalom agro/i, /^apply for internal phytosanitary/i, target("assalom-agro", "internal-phyto-application")],
  [/assalom agro/i, /^obtain internal phytosanitary/i, target("assalom-agro", "internal-phyto-certificate")],
  [/uzbekexpertiza/i, /certificate of origin/i, target("expertiza", "origin-application")],
  [/single window/i, /certificate of origin/i, target("single-window", "origin-certificate")],
  [/single window/i, /^apply for phytosanitary certificate/i, target("single-window", "phyto-certificate")],
  [/single window/i, /^apply for quarantine permit/i, target("single-window", "quarantine-permit")],
  [/single window/i, /^obtain quarantine permit/i, target("single-window", "quarantine-permit-issue")],
  [/single window/i, /^apply for quarantine inspection act/i, target("single-window", "quarantine-inspection")],
  [/single window/i, /^obtain quarantine inspection act/i, target("single-window", "quarantine-inspection-issue")],
  [/single window/i, /^apply for sanitary-epidemiological/i, target("single-window", "sanitary-conclusion")],
  [/single window/i, /^obtain sanitary-epidemiological/i, target("single-window", "sanitary-conclusion-issue")],
  [/single window/i, /^obtain payment details/i, target("single-window", "payment-details")],
  [/single window/i, /^apply for veterinary permit/i, target("single-window", "veterinary-permit")],
  [/single window/i, /^obtain veterinary permit/i, target("single-window", "veterinary-permit-issue")],
  [/single window/i, /^apply for veterinary certificate/i, target("single-window", "veterinary-certificate")],
  [/single window/i, /^obtain veterinary certificate/i, target("single-window", "veterinary-certificate-issue")],
  [/single window/i, /^apply for certificate of conformity/i, target("single-window", "conformity-certificate")],
  [/single window/i, /^obtain certificate of conformity/i, target("single-window", "conformity-certificate-issue")],
  [/foreign economic activity/i, /preliminary visual inspection/i, target("customs", "preliminary-inspection")],
  [/foreign economic activity/i, /^create export customs declaration/i, target("customs", "declaration", { regime: "EK10" })],
  [/foreign economic activity/i, /^create cargo customs declaration/i, target("customs", "declaration", { regime: "IM70" })],
  [/foreign economic activity/i, /^create import customs declaration/i, target("customs", "declaration", { regime: "IM40" })],
  [/foreign economic activity/i, /^obtain .*declaration/i, target("customs", "declaration-release")],

  // The wider corpus: more of the railway's own services, and Single Window's
  // ecological certificate.
  [/railways single window/i, /notification on freight arrival/i, target("railway", "arrival-notice")],
  [/railways single window/i, /place for loading|loading\/unloading/i, target("railway", "loading-place-notice")],
  [/railways single window/i, /empty own wagons return|return.*empty/i, target("railway", "empty-wagon-return")],
  [/railways single window/i, /railway bill to dispatch empty/i, target("railway", "empty-wagon-bill")],
  [/single window/i, /^apply for ecological certificate/i, target("single-window", "ecological-certificate")],
  [/single window/i, /^obtain ecological certificate/i, target("single-window", "ecological-certificate-issue")],
  [/single window/i, /letter of certification after/i, target("single-window", "installation-letter")],
  // A declaration whose step doesn't name the regime: the agent fills it from
  // the procedure's own direction (modules/portals/sources.ts).
  [/foreign economic activity/i, /^create .*customs declaration/i, target("customs", "declaration")],

  // Entities the wider corpus names (243 procedures), each with its own API.
  [/e-tranzit/i, /transit declaration/i, target("e-tranzit", "transit-declaration")],
  [/e-tranzit/i, /invoice for payment|fees for entrance|entrance and transit/i, target("e-tranzit", "transit-fee")],
  [/sanitary-epidemiological/i, /invoice for payment/i, target("sanitary", "conclusion-invoice")],
  [/sanitary-epidemiological/i, /^apply for|^submit .*application/i, target("sanitary", "conclusion-application")],
  [/sanitary-epidemiological/i, /^obtain .*conclusion/i, target("sanitary", "conclusion")],
  [/medicines|uzpharm/i, /^verify state registration/i, target("medicines", "registration-check")],
  [/medicines|uzpharm|darmon/i, /^obtain contract/i, target("medicines", "services-contract")],
  [/medicines|uzpharm|darmon/i, /^apply for registration certificate|^submit corrected documents/i, target("medicines", "registration-application")],
  [/medicines|uzpharm|darmon/i, /^obtain (the )?(registration certificate|notification)/i, target("medicines", "registration-certificate")],
  [/nature protection/i, /^apply for import permit/i, target("ecology", "import-permit")],
  [/nature protection/i, /^obtain conclusion/i, target("ecology", "import-conclusion")],
  [/cargo sales agent/i, /^contract with|^submit shipper/i, target("cargo-agent", "transport-booking")],
  [/cargo sales agent/i, /^obtain air waybill/i, target("cargo-agent", "air-waybill")],
  [/electronic document management/i, /invoice for payment/i, target("edocs", "service-invoice")],
  [/electronic document management/i, /^accept completed works|^conclude contract/i, target("edocs", "acceptance-act")],
];

export function portalTargetOf(step: Pick<ProcedureStep, "entity" | "title" | "channel">): PortalTarget | null {
  if (!/^online/i.test(step.channel)) return null;
  const rule = RULES.find(([entity, title]) => entity.test(step.entity) && title.test(step.title));
  return rule ? rule[2] : null;
}
