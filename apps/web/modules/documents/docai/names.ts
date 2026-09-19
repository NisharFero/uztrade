/* Do two documents name the same company? "ООО «Шёлковый путь»" on the
 * contract and "Shelkovyy Put LLC" on the invoice are the same seller; exact
 * comparison calls them a mismatch.
 *
 * The rules transliterate Cyrillic (Russian and Uzbek letters), drop legal
 * forms (ООО, LLC, MChJ, TOO, JSC …), quotes and the address, and compare the
 * words. Same words -> ok; clearly different Latin names -> mismatch; anything
 * else - typically a translated name ("Silk Road" / "Шёлковый путь") - is
 * "unknown". Only those go to a model, which must be a local one: company
 * names are document data. It answers yes / no / unsure; unsure stays with the
 * trader. */

import { z } from "zod";
import { llmJson, providerFor, type LlmClient } from "../../ai/llm";
import type { CrossCheck, LedgerDocument } from "./crosscheck";
import type { ExtractedField } from "./compose";

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya", ў: "o", қ: "q", ғ: "g", ҳ: "h", і: "i", ә: "a", ө: "o", ү: "u", ұ: "u", ң: "n",
};

const LEGAL_FORMS =
  /\b(obshchestvo s ogranichennoy otvetstvennostyu|masuliyati cheklangan jamiyati?|limited liability company|joint stock company|limited|ltd|llc|l\.l\.c|inc|corp|co|company|gmbh|ooo|mchzh|mchj|xk|qk|ao|oao|zao|pao|jsc|ojsc|aj|too|tov|ip|yatt|chp|firm|firma|trade house|torgovyy dom)\b/g;

const translit = (text: string) => [...text.toLowerCase()].map((ch) => CYRILLIC[ch] ?? ch).join("");

/** The company name as words that survive script, legal form and spelling variants. */
export function companyWords(raw: string): string[] {
  const name = raw.split(/[,\n;]|\s-\s/)[0];
  const latin = translit(name)
    .replace(/[«»"“”„'ʻʼ`’]/g, "")
    .replace(LEGAL_FORMS, " ")
    .replace(/[^a-z0-9]+/g, " ")
    // spelling variants of one transliteration: Shyolkovyy / Shelkovyi / Shelkovij
    .replace(/yo/g, "e")
    .replace(/kh|x/g, "h")
    .replace(/(iy|yy|ij|yi)\b/g, "y")
    .replace(/(.)\1+/g, "$1");
  return [...new Set(latin.split(" ").filter((w) => w.length >= 2))];
}

const isCyrillic = (text: string) => /[Ѐ-ӿ]/.test(text);

export type NameVerdict = { status: CrossCheck["status"]; why: string };

export function compareCompanies(a: string, b: string): NameVerdict {
  const wa = companyWords(a);
  const wb = companyWords(b);
  if (!wa.length || !wb.length) return { status: "unknown", why: "no name left once the legal form is removed" };
  const shared = wa.filter((w) => wb.includes(w)).length;
  const [small, large] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  if (shared === small.length && small.some((w) => w.length >= 3)) {
    return { status: "ok", why: wa.join(" ") === wb.join(" ") ? "same name once transliterated, legal form aside" : "one name contains the other" };
  }
  if (shared / new Set([...wa, ...wb]).size >= 0.5) return { status: "ok", why: "mostly the same words once transliterated" };
  if (shared === 0 && isCyrillic(a) === isCyrillic(b)) return { status: "mismatch", why: "different names" };
  void large;
  return { status: "unknown", why: isCyrillic(a) !== isCyrillic(b) ? "different scripts — possibly a translated name" : "partly the same words" };
}

const SIDES: { side: string; keys: string[] }[] = [
  { side: "Seller / exporter", keys: ["seller", "exporter", "sender", "shipper"] },
  { side: "Buyer / consignee", keys: ["buyer", "consignee"] },
];

const nameOn = (fields: ExtractedField[], keys: string[]) => keys.map((k) => fields.find((f) => f.key === k && f.value)).find(Boolean);

/** One check per party per earlier document that names it. */
export function partyChecks(fields: ExtractedField[], documents: LedgerDocument[]): CrossCheck[] {
  const checks: CrossCheck[] = [];
  for (const { side, keys } of SIDES) {
    const here = nameOn(fields, keys);
    if (!here?.value) continue;
    for (const doc of documents) {
      const there = nameOn(doc.fields, keys);
      if (!there?.value) continue;
      const verdict = compareCompanies(here.value, there.value);
      checks.push({
        check: `${side} vs ${doc.label}`,
        status: verdict.status,
        detail: `“${here.value}” here vs “${there.value}” on the ${doc.label.toLowerCase()} — ${verdict.why}`,
        names: [here.value, there.value],
      });
    }
  }
  return checks;
}

const Same = z.object({ same: z.enum(["yes", "no", "unsure"]), reason: z.string().max(240) });

/** Name checks the rules couldn't settle, put to a local model. Other checks pass through. */
export async function adjudicateNames(checks: CrossCheck[], llm: LlmClient | undefined, limit = 4): Promise<CrossCheck[]> {
  if (!providerFor(llm, "document")) return checks;
  let asked = 0;
  const out: CrossCheck[] = [];
  for (const check of checks) {
    if (check.status !== "unknown" || !check.names || asked >= limit) {
      out.push(check);
      continue;
    }
    asked++;
    const answer = await llmJson(llm, {
      sensitivity: "document",
      system:
        "Two trade documents name a company. Decide whether they are the same legal entity, allowing for transliteration (Cyrillic/Latin), translation of the name and legal-form abbreviations (ООО = LLC = MChJ). Say unsure when the names alone don't settle it.",
      prompt: JSON.stringify({ a: check.names[0], b: check.names[1] }),
      schema: Same,
      maxTokens: 300,
    });
    if (!answer || answer.data.same === "unsure") {
      out.push(answer ? { ...check, detail: `${check.detail}; the model is unsure: ${answer.data.reason}` } : check);
      continue;
    }
    out.push({
      ...check,
      status: answer.data.same === "yes" ? "ok" : "mismatch",
      detail: `${check.detail}; local model (${answer.model}): ${answer.data.same === "yes" ? "same company" : "different companies"} — ${answer.data.reason}`,
    });
  }
  return out;
}
