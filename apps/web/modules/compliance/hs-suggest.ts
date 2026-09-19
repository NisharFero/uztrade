/* HS code suggestions for a field an entity wants in more digits (6 for a
 * certificate of origin, 10 for the customs declaration).
 *
 * Candidates only ever come from the nomenclature extract, narrowed to the
 * heading intake already knows ("0902" for tea). The rules rank them by what
 * the goods description says (green or black, packing size); a model, when
 * one is allowed, re-ranks the same candidates and says why. A code the model
 * names that isn't a candidate is dropped. The trader picks one; the entity
 * still checks it. */

import { z } from "zod";
import { llmJson, providerFor, type LlmClient } from "../ai/llm";
import { HS_SOURCE, HS_SUBHEADINGS, type HsSubheading } from "./hs-nomenclature";

export type HsSuggestion = { code: string; description: string; reason: string; by: "rules" | "model" };

/** "0902" -> ["0902"], "0806.20" -> ["080620"], "07–08" -> ["07", "08"]. */
function prefixesOf(heading: string | null): string[] {
  if (!heading) return [];
  if (/[–-]/.test(heading)) return heading.split(/[–-]/).map((p) => p.replace(/\D/g, "")).filter(Boolean);
  const digits = heading.replace(/\D/g, "");
  return digits ? [digits] : [];
}

/** The size of one immediate packing, in kg, when the text states it ("100 g packets", "25 kg bags"). */
export function packingKg(text: string): number | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(kg|кг|g|gr|г)\b[^.;\n]{0,24}?(pack|packet|box|bag|carton|пачк|пакет|короб|мешк|упаков)/i);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return /^(kg|кг)$/i.test(m[2]) ? n : n / 1000;
}

type Ranked = { entry: HsSubheading; score: number; why: string[] };

export function rankCandidates(heading: string | null, text: string): Ranked[] {
  const prefixes = prefixesOf(heading);
  if (!prefixes.length) return [];
  const lower = text.toLowerCase();
  const pack = packingKg(text);
  return HS_SUBHEADINGS.filter((e) => prefixes.some((p) => e.code.startsWith(p.slice(0, 6))))
    .map((entry) => {
      const why: string[] = [];
      let score = 0;
      for (const k of entry.keywords) {
        if (k === "small pack" || k === "bulk") continue;
        if (lower.includes(k)) {
          score += 2;
          why.push(`“${k}”`);
        }
      }
      if (pack != null) {
        const small = entry.keywords.includes("small pack");
        const bulk = entry.keywords.includes("bulk");
        if ((small && pack <= 3) || (bulk && pack > 3)) {
          score += 3;
          why.push(`packing of ${pack < 1 ? `${Math.round(pack * 1000)} g` : `${pack} kg`}`);
        }
      }
      return { entry, score, why };
    })
    .sort((a, b) => b.score - a.score);
}

const withDigits = (code: string, digits: number) => (digits > 6 ? code.padEnd(digits, "0") : code);
const nationalNote = (digits: number) => (digits > 6 ? " National digits 0000 assumed — check them against the customs tariff." : "");

const Ranking = z.object({ ranked: z.array(z.object({ code: z.string(), reason: z.string().max(300) })).max(6) });

export async function suggestHsCodes(input: {
  /** The heading intake resolved, e.g. "0902". */
  heading: string | null;
  /** Goods as named at intake - public. */
  goods: string;
  /** Goods description and packing read from the trader's documents - document data. */
  documentText: string | null;
  digits: number;
  llm?: LlmClient;
  limit?: number;
}): Promise<HsSuggestion[]> {
  const limit = input.limit ?? 3;
  const useDocuments = Boolean(input.documentText) && Boolean(providerFor(input.llm, "document"));
  const text = [input.goods, input.documentText ?? ""].join(" ");
  const ranked = rankCandidates(input.heading, text);
  if (!ranked.length) return [];

  const rules = (): HsSuggestion[] =>
    ranked.slice(0, limit).map((r) => ({
      code: withDigits(r.entry.code, input.digits),
      description: r.entry.description,
      reason: `${r.why.length ? `Matches ${r.why.join(", ")}` : `A subheading of ${input.heading}; the goods don't say which`} (${HS_SOURCE}).${nationalNote(input.digits)}`,
      by: "rules",
    }));
  if (ranked.length === 1) return rules();

  const answer = await llmJson(input.llm, {
    sensitivity: useDocuments ? "document" : "public",
    system:
      "You classify goods under the Harmonized System. Rank ONLY the candidate subheadings given, best first, for the goods described. Give a one-sentence reason from the description. Don't add codes.",
    prompt: JSON.stringify({
      goods: useDocuments ? text : input.goods,
      candidates: ranked.map((r) => ({ code: r.entry.code, description: r.entry.description })),
    }),
    schema: Ranking,
    maxTokens: 900,
  });
  if (!answer) return rules();
  const byCode = new Map(ranked.map((r) => [r.entry.code, r.entry]));
  const picked = answer.data.ranked.filter((r, i, all) => byCode.has(r.code) && all.findIndex((x) => x.code === r.code) === i);
  if (!picked.length) return rules();
  return picked.slice(0, limit).map((r) => ({
    code: withDigits(r.code, input.digits),
    description: byCode.get(r.code)!.description,
    reason: `${r.reason} (model, choosing within ${HS_SOURCE}).${nationalNote(input.digits)}`,
    by: "model",
  }));
}
