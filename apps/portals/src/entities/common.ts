/* Fields and checks more than one entity uses. */

import type { FieldDef } from "../contract.ts";

export type Flags = { field: string; reason: string }[];

export const applicant = {
  inn: { key: "applicant.inn", label: "Applicant INN", type: "inn", required: true, hint: "the 9-digit taxpayer number" },
  name: { key: "applicant.name", label: "Applicant name", type: "text", required: true },
  phone: { key: "applicant.phone", label: "Contact phone", type: "phone", required: true },
  email: { key: "applicant.email", label: "Contact email", type: "email", required: true },
} satisfies Record<string, FieldDef>;

export const num = (value: string | undefined) => (value == null || value === "" ? Number.NaN : Number(value));

export const plusDays = (now: Date, days: number) => new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);

const chapter = (hs: string | undefined) => Number((hs ?? "").slice(0, 2));

/** HS chapters 06-14: live plants, vegetables, fruit, coffee and tea, cereals, seeds. */
export const isPlantProduct = (hs: string | undefined) => chapter(hs) >= 6 && chapter(hs) <= 14;

const HEADINGS: [string, RegExp, string][] = [
  ["0902", /\btea\b/i, "tea"],
  ["0702", /tomato|vegetable/i, "tomatoes"],
  ["0806", /grape|raisin|sultana/i, "grapes and raisins"],
  ["0813", /dried|apricot|prune|fruit/i, "dried fruit"],
  ["2009", /juice/i, "fruit and vegetable juices"],
  ["3101", /fertili[sz]er|manure|compost|guano/i, "animal or vegetable fertilisers"],
];

/** HS heading 3101: animal or vegetable fertilisers - under both quarantine and veterinary control. */
export const isFertilizer = (hs: string | undefined) => (hs ?? "").startsWith("3101");

/** An HS heading that names other goods than the ones declared, e.g. 0702 (tomatoes) for tea. */
export function headingMismatch(hs: string | undefined, goods: string | undefined): string | null {
  const hit = HEADINGS.find(([prefix]) => (hs ?? "").startsWith(prefix));
  if (!hit || !goods || hit[1].test(goods)) return null;
  return `HS ${hit[0]} is ${hit[2]}, but the goods are declared as “${goods}”`;
}

const CIS = ["kazakhstan", "kyrgyzstan", "tajikistan", "russia", "russian federation", "belarus", "armenia", "moldova", "azerbaijan"];

/** Destinations in the CIS free-trade area, where origin is proven with form CT-1. */
export const isCis = (country: string | undefined) => CIS.includes((country ?? "").toLowerCase());
