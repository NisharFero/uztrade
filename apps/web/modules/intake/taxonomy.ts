/* Commodity taxonomy - the deterministic half of intake.
 *
 * Procedures 868, 325 and 306 are the same 48-step skeleton with a different
 * commodity label, so "which procedure" is really "which commodity category".
 * That call is made here from a fixed table, never by a model's best guess:
 * grapes are fresh produce (325), raisins are dried fruit (306), and a bare
 * "apricots" is genuinely either, so intake asks rather than picks.
 *
 * Juices (161) and fertilizers (57, 707) are their own categories. "Any
 * cargo" is not a commodity: it is what the two rail-logistics procedures
 * (782 dispatch, 924 delivery) carry, reached by asking to arrange rail
 * transport or delivery rather than by naming goods.
 *
 * HS headings are the WCO Harmonized System ones (public, stable). They
 * identify the heading only; no tariff rate is implied.
 */

export type Category =
  | "tea"
  | "dried fruits"
  | "fresh fruits and vegetables"
  | "fruit and vegetable juices"
  | "animal or vegetable fertilizers"
  | "any cargo";

export const CATEGORIES: Category[] = [
  "tea",
  "dried fruits",
  "fresh fruits and vegetables",
  "fruit and vegetable juices",
  "animal or vegetable fertilizers",
  "any cargo",
];

/** What each category is called in a question or a chip. */
export const CATEGORY_LABEL: Record<Category, string> = {
  tea: "Tea",
  "dried fruits": "Dried fruits",
  "fresh fruits and vegetables": "Fresh fruits and vegetables",
  "fruit and vegetable juices": "Fruit and vegetable juices",
  "animal or vegetable fertilizers": "Fertilizers (animal or vegetable)",
  "any cargo": "Rail transport for any cargo",
};

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
  { re: /\bbrinjals?\b|\beggplants?\b|\baubergines?\b/i, term: "brinjal", hs: "0709.30" },
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

/** Juice before fruit: "apple juice" is juice (2009), not apples. */
const JUICES: Term[] = [
  { re: /\b(orange|citrus)\s+juices?\b/i, term: "orange juice", hs: "2009.1" },
  { re: /\bgrape(fruit)?\s+juices?\b/i, term: "grape juice", hs: "2009.6" },
  { re: /\bapple\s+juices?\b/i, term: "apple juice", hs: "2009.7" },
  { re: /\btomato\s+juices?\b/i, term: "tomato juice", hs: "2009.50" },
  { re: /\b(vegetable\s+)?juices?\b|\bnectars?\b/i, term: "fruit and vegetable juices", hs: "2009" },
];

/** Animal or vegetable fertilisers (3101) - not mineral or chemical ones (3102-3105). */
const FERTILIZERS: Term[] = [
  { re: /\bmanure\b|\bcompost\b|\bguano\b|\bbio-?humus\b|\bvermicompost\b/i, term: "organic fertilizer", hs: "3101" },
  { re: /\b(organic|animal|vegetable|natural)\s+fertili[sz]ers?\b|\bfertili[sz]ers?\b/i, term: "animal or vegetable fertilizers", hs: "3101" },
];
const MINERAL_FERTILIZER = /\b(mineral|chemical|nitrogen(ous)?|urea|ammonium|potash|potassium|phosphat(e|ic)|npk)\b.*\bfertili[sz]ers?\b|\b(urea|ammonium nitrate|potash)\b/i;

/** Arranging rail carriage itself, whatever the goods: 782 (dispatch) and 924 (delivery). */
const RAIL_LOGISTICS =
  /\bany cargo\b|\bgeneral cargo\b|\brail (freight|logistics|transport(ation)?)\b|\b(arrange|book|organi[sz]e)\b[^.?!]{0,30}\b(rail|railway|train|wagons?|cargo (transportation|delivery))\b|\bcargo (transportation|delivery) by (rail|train)\b/i;

/** Goods we recognise and can name when declining. Checked first so a
 *  supported word inside them doesn't slip through. */
const UNSUPPORTED =
  /\b(cotton|wheat|grain|flour|rice|cars?|vehicles?|textiles?|yarn|fabrics?|garments?|gold|copper|steel|metals?|meat|milk|dairy|oil|gas|cement|electronics|phones?|machinery|coffee|sugar|walnuts?|almonds?|pistachios?|nuts|silk|spices|honey|chemicals?)\b/i;

const hit = (category: Category, term: string, hs: string): CommodityHit => ({ kind: "known", category, term, hs });

export function commodityOf(text: string | null | undefined): CommodityHit {
  if (!text) return { kind: "none" };
  if (MINERAL_FERTILIZER.test(text)) return { kind: "unsupported", term: "mineral fertilizers" };
  for (const t of FERTILIZERS) if (t.re.test(text)) return hit("animal or vegetable fertilizers", t.term, t.hs);
  for (const t of JUICES) if (t.re.test(text)) return hit("fruit and vegetable juices", t.term, t.hs);

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
  if (RAIL_LOGISTICS.test(text)) return hit("any cargo", "cargo", "");
  return { kind: "none" };
}

/** For rail logistics, which way the cargo goes: dispatching it (782) or taking delivery (924). */
export function logisticsDirection(text: string): "export" | "import" | null {
  const dispatch = /\b(dispatch|send|ship(ping)? out|load(ing)?|transportation)\b/i.test(text);
  const delivery = /\b(deliver(y|ed)?|receiv(e|ing)|arriv(al|ing)|unload(ing)?|take delivery)\b/i.test(text);
  if (dispatch === delivery) return null;
  return dispatch ? "export" : "import";
}
