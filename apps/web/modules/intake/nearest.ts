/* Goods nobody listed.
 *
 * The lexicon in `taxonomy.ts` covers the words traders actually use for the
 * published categories, but a corpus of 38 categories cannot anticipate every
 * product - "saffron", "copper wire", "car parts". Rather than refuse (a dead
 * end) or silently substitute (a lie), this asks a model one narrow question:
 * of these published categories, which one would this product be traded under,
 * and why?
 *
 * Three rules keep it honest:
 *   - The answer is checked against the corpus. A category the model invents is
 *     dropped, and with it the whole proposal.
 *   - The proposal is never applied on its own. It goes back to the trader as a
 *     question with the reasoning attached, and only their yes sets the goods.
 *   - The product keeps its own name. "Saffron" stays saffron on the case, the
 *     steps and the documents; the category is only how it is published.
 *
 * Goods names are public words, so this is a `public` prompt - no document or
 * case content is sent.
 */

import { z } from "zod";
import { llmJson, type LlmClient } from "../ai/llm";
import { HS_SUBHEADINGS } from "../compliance/hs-nomenclature";
import { CATEGORIES, type Category } from "./taxonomy";

/** Either the closest published category, or the goods named and nothing that
 *  fits them. Null is only for "no model, or an answer we could not use". */
export type NearestResult =
  | ({ kind: "proposal" } & NearestProposal)
  | { kind: "none"; product: string };

export type NearestProposal = {
  /** What the trader called it, kept for every surface that names the goods. */
  term: string;
  category: Category;
  /** HS heading for the product, 2-6 digits; "" when the model gave none. */
  hs: string;
  /** One sentence, shown to the trader before they accept. */
  reason: string;
};

const Answer = z.object({
  /** The product in one or two plain English words, as the trader meant it. */
  product: z.string().nullish(),
  /** One of the published categories, spelled exactly. */
  category: z.string().nullish(),
  hs: z.string().nullish(),
  reason: z.string().nullish(),
  /** The model's own call: is this genuinely close, or nothing like any of them? */
  close: z.boolean().nullish(),
});

const SYSTEM = [
  "You match a product a trader wants to move to the goods category its trade procedure is published under, in Uzbekistan.",
  "Choose from the published categories given to you, spelled exactly as listed. Never invent a category.",
  "The categories are broad trade families, not literal lists: 'dairy products' covers milk, cheese, yoghurt and infant formula; 'textile and garment' covers clothing and made-up textile articles such as scarves; 'medical equipment' covers instruments and apparatus.",
  "Judge by the product's HS chapter. A product in the same chapter family as a category belongs to it, even if the category does not name the product.",
  "close=true for a product of the same kind as a category. close=false only when the product belongs to a different trade family altogether - machinery, vehicles, minerals or spices, none of which are published here.",
  "hs: the WCO Harmonized System heading for the product, 2 to 6 digits, no tariff rate.",
  "reason: one short sentence a trader would accept, naming the product, the category and why they go together.",
  "JSON keys: product, category, hs, reason, close.",
].join("\n");

const HS = /^\d{2,6}(\.\d{1,2})?$/;

/** A heading the app can actually stand behind: the WCO extract in
 *  modules/compliance/hs-nomenclature.ts has it. The model volunteers a code
 *  for every product and is wrong often enough to matter - it offered 2403
 *  (tobacco) for infant formula - so an unverified code is dropped rather than
 *  shown to a trader as though the app had checked it. The extract only covers
 *  the goods the first procedures needed; replacing it with the national
 *  nomenclature makes the rest of these codes appear on their own. */
function verifiedHeading(raw: string): string {
  const code = raw.trim();
  if (!HS.test(code)) return "";
  const digits = code.replace(/\D/g, "");
  return HS_SUBHEADINGS.some((s) => s.code.startsWith(digits) || digits.startsWith(s.code.slice(0, 4))) ? code : "";
}

/** Rail transport for any cargo is a service, not a goods category: a trader
 *  asking to import copper wire is not asking to book a wagon. */
const candidateCategories = () => CATEGORIES.filter((c) => c !== "any cargo");

/** The closest published category for goods the lexicon doesn't know, the goods
 *  named when nothing fits, or null when there is no usable answer at all. */
export async function nearestCategory(text: string, llm: LlmClient | undefined): Promise<NearestResult | null> {
  const answer = await llmJson(llm, {
    sensitivity: "public",
    system: SYSTEM,
    prompt: [`Trader's words: ${text}`, "", "Published categories:", ...candidateCategories().map((c) => `- ${c}`)].join("\n"),
    schema: Answer,
    // Room for the model's own reasoning tokens before the JSON: at 400 the
    // answer came back truncated to nothing.
    maxTokens: 900,
  });
  if (!answer) return null;

  const { product, category, hs, reason, close } = answer.data;
  const term = (product ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const named = term && term.length <= 40 ? term : "";

  // The model's own judgement that nothing fits is worth more than a category
  // that merely sounds similar - saffron is a spice, not a dried fruit.
  if (close === false) return named ? { kind: "none", product: named } : null;

  // The corpus decides whether the category exists, not the model.
  const matched = candidateCategories().find((c) => c.toLowerCase() === (category ?? "").trim().toLowerCase());
  if (!matched) return named ? { kind: "none", product: named } : null;
  if (!named) return null;

  return {
    kind: "proposal",
    term: named,
    category: matched,
    hs: verifiedHeading(hs ?? ""),
    reason: (reason ?? "").trim().slice(0, 240),
  };
}

/** How the proposal is put to the trader: the reasoning first, then the ask.
 *  The HS heading appears only when it was verified against the nomenclature. */
export function proposalQuestion(p: NearestProposal): string {
  const because = p.reason || `${p.term} is traded under ${p.category}`;
  const hs = p.hs ? ` (HS ${p.hs})` : "";
  // A question about the goods, not about opening anything: nothing is opened
  // until the trader says yes to the full summary.
  return `${because.replace(/\.$/, "")}${hs}. Did you mean ${p.term}, published under ${p.category}? If so, I'll use that procedure; if not, tell me what the goods are.`;
}
