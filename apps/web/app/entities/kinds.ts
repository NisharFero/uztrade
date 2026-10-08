import { Icon } from "../../components/icons";
import type { EntityType } from "../../modules/catalog/seed";

/* The nine kinds of counterparty, and the five families they group into.
 *
 * Shared by the directory and each kind's own page, so a card and the page it
 * opens can never describe the kind differently. Everything here describes a
 * CLASSIFICATION — the one `ENTITY_RULES` already makes in
 * modules/catalog/seed.ts — and never a record. */

/** Families group the nine kinds into the five things a trader actually deals
 *  with, and each family keeps one hue. Colour is never the only signal: the
 *  family is written out beside it. */
export const FAMILY = {
  state: { label: "State bodies", hue: "blue" },
  digital: { label: "Online systems", hue: "cyan" },
  money: { label: "Money", hue: "amber" },
  movement: { label: "Movement & storage", hue: "green" },
  private: { label: "Private providers", hue: "fuchsia" },
} as const;

export type Family = keyof typeof FAMILY;

export const TYPES: { id: EntityType; label: string; family: Family; icon: React.ReactNode; blurb: string }[] = [
  { id: "government", label: "Government", family: "state", icon: Icon.landmark, blurb: "Ministries and state committees that decide on a case rather than process it." },
  { id: "customs", label: "Customs", family: "state", icon: Icon.lock, blurb: "Customs posts and border crossings where a consignment is declared, checked and released." },
  { id: "inspection", label: "Inspection", family: "state", icon: Icon.compliance, blurb: "Quarantine, sanitary and checkpoint bodies that examine the goods themselves before they may travel." },
  { id: "certification", label: "Certification", family: "state", icon: Icon.documents, blurb: "Bodies that test, assess and issue the certificate a shipment has to travel on." },
  { id: "portal", label: "Portals", family: "digital", icon: Icon.compose, blurb: "The online systems a filing is actually submitted through — the ones an agent can reach without you." },
  { id: "bank", label: "Banks", family: "money", icon: Icon.receipt, blurb: "Where a duty, tariff or service fee is settled. Money only ever moves on your authorisation." },
  { id: "transport", label: "Transport", family: "movement", icon: Icon.truck, blurb: "Carriers, railways, stations and terminals that move the cargo or hold it between legs." },
  { id: "facility", label: "Facilities", family: "movement", icon: Icon.home, blurb: "Warehouses and loading places: where the goods physically are when a step asks for them." },
  { id: "service", label: "Services", family: "private", icon: Icon.user, blurb: "Private intermediaries — brokers, forwarders, insurers and sales agents you appoint yourself." },
];

export const CAPABILITY: Record<string, string> = {
  perform_inspection: "Carries out inspections",
  accept_payment: "Accepts payment",
  complete_procedure_step: "Completes procedure steps",
};
