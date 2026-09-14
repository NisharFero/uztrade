/* Commodity taxonomy - the deterministic half of intake.
 *
 * Procedures 868, 325 and 306 are the same 48-step skeleton with a different
 * commodity label, so "which procedure" is really "which commodity category".
 * That call is made here from a fixed table, never by a model's best guess:
 * grapes are fresh produce (325), raisins are dried fruit (306), and a bare
 * "apricots" is genuinely either, so intake asks rather than picks.
 *
 * HS headings are the WCO Harmonized System ones (public, stable). They
 * identify the heading only; no tariff rate is implied.
 */

export type Category = "tea" | "dried fruits" | "fresh fruits and vegetables";

export const CATEGORIES: Category[] = ["tea", "dried fruits", "fresh fruits and vegetables"];

export type CommodityHit =
  | { kind: "known"; category: Category; term: string; hs: string }
  | { kind: "ambiguous"; options: Category[]; term: string }
  | { kind: "unsupported"; term: string }
  | { kind: "none" };

type Term = { re: RegExp; term: string; hs: string };

const DRIED_WORD = /\b(dried|dry|sun-dried|dehydrated)\b/i;
const FRESH_WORD = /\b(fresh|chilled|raw)\b/i;

const TEA: Term[] = [{ re: /\b(green |black )?tea\b|\bchai\b/i, term: "tea", hs: "0902" }];

/** Only ever dried. */
const DRIED_ONLY: Term[] = [
  { re: /\braisins?\b|\bsultanas?\b|\bkishmish\b/i, term: "raisins", hs: "0806.20" },
  { re: /\bprunes?\b/i, term: "prunes", hs: "0813.20" },
  { re: /\bkuraga\b/i, term: "dried apricots", hs: "0813.10" },
  { re: /\bdried fruits?\b|\bdry fruits?\b/i, term: "dried fruits", hs: "0813" },
];

/** Traded both ways - the qualifier decides, and without one intake asks. */
const EITHER: { re: RegExp; term: string; fresh: string; dried: string }[] = [
  { re: /\bapricots?\b/i, term: "apricots", fresh: "0809.10", dried: "0813.10" },
  { re: /\bplums?\b/i, term: "plums", fresh: "0809.40", dried: "0813.20" },
  { re: /\bfigs?\b/i, term: "figs", fresh: "0804.20", dried: "0804.20" },
  { re: /\bfruits?\b/i, term: "fruit", fresh: "08", dried: "0813" },
];

/** Fresh by default. Vegetables are listed separately: "dried tomatoes" is a
 *  dried vegetable (HS 0712), which no procedure in scope covers. */
const VEGETABLES: Term[] = [
  { re: /\btomato(es)?\b/i, term: "tomatoes", hs: "0702" },
  { re: /\bpotato(es)?\b/i, term: "potatoes", hs: "0701" },
  { re: /\bonions?\b|\bgarlic\b/i, term: "onions", hs: "0703" },
  { re: /\bcabbages?\b|\bcauliflowers?\b/i, term: "cabbage", hs: "0704" },
  { re: /\bcarrots?\b/i, term: "carrots", hs: "0706" },
  { re: /\bcucumbers?\b/i, term: "cucumbers", hs: "0707" },
  { re: /\b(sweet |bell )?peppers?\b/i, term: "peppers", hs: "0709.60" },
  { re: /\bvegetables?\b|\bveg\b/i, term: "vegetables", hs: "07" },
];

const FRESH_FRUIT: Term[] = [
  { re: /\bgrapes?\b/i, term: "grapes", hs: "0806.10" },
  { re: /\b(water)?melons?\b/i, term: "melons", hs: "0807" },
  { re: /\bapples?\b/i, term: "apples", hs: "0808.10" },
  { re: /\bpears?\b|\bquinces?\b/i, term: "pears", hs: "0808" },
  { re: /\bcherr(y|ies)\b/i, term: "cherries", hs: "0809.2" },
  { re: /\bpeach(es)?\b|\bnectarines?\b/i, term: "peaches", hs: "0809.30" },
  { re: /\bpomegranates?\b|\bpersimmons?\b|\bkiwis?\b|\bstrawberr(y|ies)\b/i, term: "fruit", hs: "0810" },
  { re: /\blemons?\b|\boranges?\b|\bmandarins?\b|\btangerines?\b|\bcitrus\b/i, term: "citrus", hs: "0805" },
  { re: /\bproduce\b/i, term: "fresh produce", hs: "07–08" },
];

/** Goods we recognise and can name when declining. Checked first so "fruit
 *  juice" is declined as juice, not asked about as fruit. */
const UNSUPPORTED =
  /\b(cotton|wheat|grain|flour|rice|cars?|vehicles?|textiles?|yarn|fabrics?|garments?|gold|copper|steel|metals?|fertili[sz]ers?|juices?|meat|milk|dairy|oil|gas|cement|electronics|phones?|machinery|coffee|sugar|walnuts?|almonds?|pistachios?|nuts|silk|spices|honey|chemicals?)\b/i;

const hit = (category: Category, term: string, hs: string): CommodityHit => ({ kind: "known", category, term, hs });

export function commodityOf(text: string | null | undefined): CommodityHit {
  if (!text) return { kind: "none" };
  const unsupported = text.match(UNSUPPORTED);
  if (unsupported) return { kind: "unsupported", term: unsupported[1].toLowerCase() };

  for (const t of TEA) if (t.re.test(text)) return hit("tea", t.term, t.hs);

  // "fresh fruits and vegetables" names the category outright.
  if (/\bfresh\b.*\b(fruits?|vegetables?|produce)\b|\bfruits? and vegetables\b/i.test(text)) {
    return hit("fresh fruits and vegetables", "fresh fruits and vegetables", "07–08");
  }

  const dried = DRIED_WORD.test(text);
  const fresh = FRESH_WORD.test(text);

  for (const t of DRIED_ONLY) if (t.re.test(text)) return hit("dried fruits", t.term, t.hs);

  for (const t of VEGETABLES) {
    if (!t.re.test(text)) continue;
    return dried ? { kind: "unsupported", term: `dried ${t.term}` } : hit("fresh fruits and vegetables", t.term, t.hs);
  }

  for (const t of FRESH_FRUIT) {
    if (!t.re.test(text)) continue;
    return dried ? hit("dried fruits", `dried ${t.term}`, "0813") : hit("fresh fruits and vegetables", t.term, t.hs);
  }

  for (const t of EITHER) {
    if (!t.re.test(text)) continue;
    if (dried && !fresh) return hit("dried fruits", `dried ${t.term}`, t.dried);
    if (fresh && !dried) return hit("fresh fruits and vegetables", t.term, t.fresh);
    return { kind: "ambiguous", options: ["fresh fruits and vegetables", "dried fruits"], term: t.term };
  }

  // "export something dried by train" - the qualifier alone still names dried fruit.
  if (dried) return hit("dried fruits", "dried fruits", "0813");
  return { kind: "none" };
}
