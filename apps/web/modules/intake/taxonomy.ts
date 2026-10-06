/* Commodity taxonomy - the deterministic half of intake.
 *
 * A procedure is written for a goods *category* ("dairy products"); a trader
 * arrives with a *product* ("yoghurt"). This module is the bridge, and it is a
 * fixed table rather than a model's guess: grapes are fresh produce, raisins
 * are dried fruit, and a bare "apricots" is genuinely either, so intake asks
 * rather than picks.
 *
 * The categories themselves are not listed here - they come from the published
 * corpus (`CATEGORIES`), so adding procedures adds reachable goods. What this
 * file adds is the vocabulary: which words a trader might use for each one,
 * and the HS heading that justifies the match. A product nobody listed falls
 * through to `{ kind: "none" }` and `modules/intake/nearest.ts` reasons about
 * it instead - it never gets silently forced into a category.
 *
 * HS headings are the WCO Harmonized System ones (public, stable). They
 * identify the heading only; no tariff rate is implied.
 */

import { CATALOGUE, PROCEDURE_IDS } from "../procedures/data/procedures.generated";

/** A goods category as the corpus spells it ("dairy products"). */
export type Category = string;

/** Every category a case can be opened for, from the published corpus.
 *  Transit is excluded: it crosses Uzbekistan without a consignee here. */
export const CATEGORIES: Category[] = [
  ...new Set(PROCEDURE_IDS.map((id) => CATALOGUE[id]).filter((p) => p.direction !== "transit").map((p) => p.goods)),
].sort();

const LABEL_OVERRIDES: Record<string, string> = {
  "any cargo": "Rail transport for any cargo",
  "animal or vegetable fertilizers": "Fertilizers (animal or vegetable)",
  "vegetable oils for consumers' use and consumption": "Vegetable oils (edible)",
  "vegetable oils for technical or industrial use": "Vegetable oils (technical)",
  "perfumery, cosmetic or toilet preparations": "Perfumery and cosmetics",
};

/** What a category is called in a question or a chip. */
export function categoryLabel(category: Category): string {
  return LABEL_OVERRIDES[category] ?? category.charAt(0).toUpperCase() + category.slice(1);
}

/** Kept for call sites that read it as a table. */
export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c, categoryLabel(c)]),
);

export type CommodityHit =
  | { kind: "known"; category: Category; term: string; hs: string }
  | { kind: "ambiguous"; options: Category[]; term: string }
  | { kind: "unsupported"; term: string }
  | { kind: "none" };

type Term = { re: RegExp; term: string; hs: string };

const DRIED_WORD = /\b(dried|dry|sun-dried|dehydrated)\b/i;
const FRESH_WORD = /\b(fresh|chilled|raw)\b/i;

/* --------------------------------------------------------- produce & food --- */

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
  { re: /\bproduce\b/i, term: "fresh produce", hs: "07-08" },
];

/** Juice before fruit: "apple juice" is juice (2009), not apples. */
const JUICES: Term[] = [
  { re: /\b(orange|citrus)\s+juices?\b/i, term: "orange juice", hs: "2009.1" },
  { re: /\bgrape(fruit)?\s+juices?\b/i, term: "grape juice", hs: "2009.6" },
  { re: /\bapple\s+juices?\b/i, term: "apple juice", hs: "2009.7" },
  { re: /\btomato\s+juices?\b/i, term: "tomato juice", hs: "2009.50" },
  { re: /\b(vegetable\s+)?juices?\b|\bnectars?\b/i, term: "fruit and vegetable juices", hs: "2009" },
];

/* --------------------------------------------------------------- the rest --- */

/** One table per category, in the order they are tried. Earlier entries win,
 *  so a specific product ("cotton yarn") beats the general word ("cotton"). */
const LEXICON: { category: Category; terms: Term[] }[] = [
  {
    category: "fruit and vegetable juices",
    terms: JUICES,
  },
  {
    category: "carbonated beverages",
    terms: [
      { re: /\bcarbonated\b|\bfizzy\b|\bsoft drinks?\b|\bsodas?\b|\blemonades?\b|\bmineral water\b|\bsparkling water\b/i, term: "carbonated beverages", hs: "2202" },
    ],
  },
  {
    category: "coffee",
    terms: [{ re: /\bcoffee\b|\bespresso\b|\bkofe\b/i, term: "coffee", hs: "0901" }],
  },
  {
    category: "dairy products",
    terms: [
      { re: /\byogh?urts?\b|\bkefir\b|\bayran\b|\bcurds?\b|\btvorog\b|\bkatyk\b/i, term: "yoghurt", hs: "0403" },
      { re: /\bcheeses?\b|\bbrynza\b|\bsuzma\b/i, term: "cheese", hs: "0406" },
      { re: /\bbutter\b|\bkaymak\b|\bghee\b/i, term: "butter", hs: "0405" },
      { re: /\bmilk powder\b|\bdried milk\b|\bcondensed milk\b/i, term: "milk powder", hs: "0402" },
      { re: /\bmilk\b|\bcreams?\b|\bdairy( products?)?\b/i, term: "milk", hs: "0401" },
    ],
  },
  {
    category: "eggs",
    terms: [{ re: /\beggs?\b/i, term: "eggs", hs: "0407" }],
  },
  {
    category: "honey",
    terms: [{ re: /\bhoney\b|\basal\b|\bbeeswax\b/i, term: "honey", hs: "0409" }],
  },
  {
    category: "meat and meat products",
    terms: [
      { re: /\bsausages?\b|\bkolbasa\b|\bsalami\b|\bkazy\b/i, term: "sausages", hs: "1601" },
      { re: /\bbeef\b|\bveal\b|\bcattle meat\b/i, term: "beef", hs: "0201" },
      { re: /\blamb\b|\bmutton\b|\bgoat meat\b/i, term: "lamb", hs: "0204" },
      // "turkey" on its own is the country far more often than the bird, and the
      // gazetteer spells it Turkiye - so the bird has to be said as meat.
      { re: /\bpoultry\b|\bchicken\b|\bturkey (meat|breast|fillets?)\b|\bduck meat\b/i, term: "poultry", hs: "0207" },
      { re: /\bmeat( products?)?\b|\bcarcass(es)?\b|\boffal\b/i, term: "meat", hs: "02" },
    ],
  },
  {
    category: "confectionery",
    terms: [
      { re: /\bchocolates?\b/i, term: "chocolate", hs: "1806" },
      { re: /\bbiscuits?\b|\bcookies?\b|\bwafers?\b|\bcrackers?\b/i, term: "biscuits", hs: "1905" },
      { re: /\bcand(y|ies)\b|\bsweets?\b|\bconfectionery\b|\bhalva\b|\bmarmalades?\b|\bnavat\b/i, term: "confectionery", hs: "1704" },
    ],
  },
  {
    category: "pasta",
    terms: [{ re: /\bpasta\b|\bspaghetti\b|\bmacaroni\b|\bnoodles?\b|\bvermicelli\b|\blagman\b/i, term: "pasta", hs: "1902" }],
  },
  {
    category: "flour",
    terms: [{ re: /\bflour\b|\bsemolina\b/i, term: "flour", hs: "1101" }],
  },
  {
    category: "cereals",
    terms: [{ re: /\bcereals?\b|\bwheat\b|\bbarley\b|\brice\b|\bmaize\b|\bcorn\b|\boats\b|\brye\b|\bgrains?\b/i, term: "cereals", hs: "10" }],
  },
  {
    category: "salt",
    terms: [{ re: /\bsalt\b|\btuz\b/i, term: "salt", hs: "2501" }],
  },
  {
    category: "seed oil",
    terms: [
      { re: /\bcotton ?seed oil\b|\bsunflower (seed )?oil\b|\bsesame oil\b|\bflax(seed)? oil\b|\brapeseed oil\b|\bseed oils?\b/i, term: "seed oil", hs: "1512" },
    ],
  },
  {
    category: "vegetable oils for consumers' use and consumption",
    terms: [
      { re: /\b(edible|food|cooking|consumer|table)\s+(vegetable\s+)?oils?\b|\bolive oil\b|\bvegetable oils? for (consumers|consumption|food)\b/i, term: "edible vegetable oil", hs: "1515" },
    ],
  },
  {
    category: "vegetable oils for technical or industrial use",
    terms: [
      { re: /\b(technical|industrial)\s+(vegetable\s+)?oils?\b|\bvegetable oils? for (technical|industrial)\b/i, term: "technical vegetable oil", hs: "1518" },
    ],
  },
  {
    category: "vegetable oils",
    terms: [{ re: /\bvegetable oils?\b/i, term: "vegetable oils", hs: "1515" }],
  },
  {
    category: "pharmaceutical products",
    terms: [
      { re: /\bmedicines?\b|\bmedicaments?\b|\bpharmaceuticals?\b|\bdrugs?\b|\btablets?\b|\bvaccines?\b|\bantibiotics?\b|\bdori\b/i, term: "medicines", hs: "30" },
    ],
  },
  {
    category: "medical equipment",
    terms: [
      { re: /\bmedical (equipment|devices?|apparatus)\b|\bultrasound\b|\bx-?ray\b|\bmri\b|\btomograph\b|\bventilators?\b|\bsyringes?\b|\bdental chairs?\b/i, term: "medical equipment", hs: "9018" },
    ],
  },
  {
    category: "perfumery, cosmetic or toilet preparations",
    terms: [
      { re: /\bperfumes?\b|\bperfumery\b|\bcosmetics?\b|\beau de (toilette|parfum)\b|\bshampoos?\b|\btoothpastes?\b|\bsoaps?\b|\blotions?\b|\btoilet preparations?\b/i, term: "cosmetics", hs: "33" },
    ],
  },
  {
    category: "washing detergents",
    terms: [{ re: /\b(washing )?detergents?\b|\bwashing powder\b|\bcleaning agents?\b/i, term: "washing detergents", hs: "3402" }],
  },
  {
    category: "mineral fertilizers",
    terms: [
      { re: /\b(mineral|chemical|nitrogen(ous)?|potash|potassium|phosphat(e|ic)|npk)\b[^.?!]{0,20}\bfertili[sz]ers?\b|\burea\b|\bammonium nitrate\b|\bsaltpetre\b/i, term: "mineral fertilizers", hs: "3102" },
    ],
  },
  {
    category: "animal or vegetable fertilizers",
    terms: [
      { re: /\bmanure\b|\bcompost\b|\bguano\b|\bbio-?humus\b|\bvermicompost\b/i, term: "organic fertilizer", hs: "3101" },
      { re: /\b(organic|animal|vegetable|natural)\s+fertili[sz]ers?\b|\bfertili[sz]ers?\b/i, term: "animal or vegetable fertilizers", hs: "3101" },
    ],
  },
  {
    category: "cotton yarn",
    terms: [{ re: /\bcotton yarns?\b|\byarns?\b|\bcotton thread\b|\bpryazha\b/i, term: "cotton yarn", hs: "5205" }],
  },
  {
    category: "fabrics",
    terms: [{ re: /\bfabrics?\b|\btextile fabrics?\b|\bcloth\b|\bsatin\b|\badras\b|\bchintz\b/i, term: "fabrics", hs: "5208" }],
  },
  {
    category: "textile and garment",
    terms: [
      { re: /\bgarments?\b|\bclothing\b|\bapparel\b|\bt-?shirts?\b|\bshirts?\b|\btrousers?\b|\bdresses\b|\bknitwear\b|\btextiles?\b/i, term: "garments", hs: "61" },
    ],
  },
  {
    category: "carpets",
    terms: [{ re: /\bcarpets?\b|\brugs?\b|\bgilam\b|\bkilims?\b/i, term: "carpets", hs: "5701" }],
  },
  {
    category: "shoes",
    terms: [{ re: /\bshoes?\b|\bfootwear\b|\bboots?\b|\bsandals?\b|\bsneakers?\b/i, term: "shoes", hs: "6403" }],
  },
  {
    category: "jewelry",
    terms: [
      { re: /\bjewell?ery\b|\bjewell?ry\b|\brings?\b|\bearrings?\b|\bnecklaces?\b|\bbracelets?\b|\bgold (items?|articles?)\b|\bsilverware\b/i, term: "jewelry", hs: "7113" },
    ],
  },
  {
    category: "furniture",
    terms: [{ re: /\bfurniture\b|\bchairs?\b|\btables?\b|\bsofas?\b|\bcabinets?\b|\bmebel\b/i, term: "furniture", hs: "9403" }],
  },
  {
    category: "wood",
    terms: [{ re: /\bwood\b|\btimber\b|\blumber\b|\bplywood\b|\bboards?\b|\blogs?\b|\bsawn ?wood\b/i, term: "wood", hs: "44" }],
  },
  {
    category: "paper and cardboard products",
    terms: [
      { re: /\bpapers?\b|\bcardboards?\b|\bcartons?\b|\bcorrugated board\b|\bnotebooks?\b|\bpaper products?\b/i, term: "paper and cardboard", hs: "48" },
    ],
  },
  {
    category: "glass and glass products",
    terms: [{ re: /\bglass(ware)?\b|\bglass products?\b|\bbottles?\b|\bglass jars?\b|\bmirrors?\b/i, term: "glass", hs: "70" }],
  },
  {
    category: "cement",
    terms: [{ re: /\bcement\b|\bclinker\b|\bportland\b/i, term: "cement", hs: "2523" }],
  },
  {
    category: "reusable packaging",
    terms: [
      { re: /\breusable packaging\b|\breturnable (packaging|containers?|pallets?)\b|\bpallets?\b|\bcrates?\b|\bkegs?\b/i, term: "reusable packaging", hs: "4415" },
    ],
  },
];

/** Arranging rail carriage itself, whatever the goods: 782 (dispatch) and 924 (delivery). */
const RAIL_LOGISTICS =
  /\bany cargo\b|\bgeneral cargo\b|\b(cargo|freight)\b[^.?!]{0,25}\bby (rail|railway|train)\b|\bwagons? of (cargo|freight)\b|\brail (freight|logistics|transport(ation)?)\b|\b(arrange|book|organi[sz]e)\b[^.?!]{0,30}\b(rail|railway|train|wagons?|cargo (transportation|delivery))\b|\bcargo (transportation|delivery) by (rail|train)\b/i;

const hit = (category: Category, term: string, hs: string): CommodityHit => ({ kind: "known", category, term, hs });

/** The heading that stands for a whole category, for when the trader names the
 *  category itself rather than a product in it. The produce categories keep
 *  their own tables, so they are named here. */
const CATEGORY_HS: Record<string, string> = {
  ...Object.fromEntries(LEXICON.map((l) => [l.category, l.terms[l.terms.length - 1].hs])),
  tea: "0902",
  "dried fruits": "0813",
  "fresh fruits and vegetables": "07-08",
  "fruit and vegetable juices": "2009",
};

/** Does the text name this category outright? Compared on words rather than by
 *  regex, so a category with punctuation in it ("perfumery, cosmetic or toilet
 *  preparations") needs no escaping. */
function namesCategory(text: string, category: Category): boolean {
  const words = (value: string) => value.toLowerCase().replace(/[^a-z0-9']+/g, " ").trim();
  return ` ${words(text)} `.includes(` ${words(category)} `);
}

/** Which published category a trader's words name, and what to call the goods.
 *  `none` means no table matched - the caller reasons about it rather than
 *  guessing (see `modules/intake/nearest.ts`). */
export function commodityOf(text: string | null | undefined): CommodityHit {
  if (!text) return { kind: "none" };

  // A category named outright - a chip the trader clicked, or a proposal they
  // accepted. Longest first, so "vegetable oils for technical or industrial
  // use" is not read as the shorter "vegetable oils".
  for (const category of [...CATEGORIES].sort((a, b) => b.length - a.length)) {
    if (category === "any cargo") continue; // reached through the logistics words below
    if (namesCategory(text, category)) return hit(category, category, CATEGORY_HS[category] ?? "");
  }

  // The tables that have to be consulted before the produce rules: a juice is
  // not its fruit, a seed oil is not a seed, a fertilizer is not a plant.
  for (const { category, terms } of LEXICON) {
    for (const t of terms) if (t.re.test(text)) return hit(category, t.term, t.hs);
  }

  for (const t of TEA) if (t.re.test(text)) return hit("tea", t.term, t.hs);

  // "fresh fruits and vegetables" names the category outright.
  if (/\bfresh\b.*\b(fruits?|vegetables?|produce)\b|\bfruits? and vegetables\b/i.test(text)) {
    return hit("fresh fruits and vegetables", "fresh fruits and vegetables", "07-08");
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

/** Every word the tables above recognise as goods ("tea", "tomatoes",
 *  "yoghurt", "cement"), for correcting a misspelt one before it is read. */
export const GOODS_WORDS: ReadonlySet<string> = new Set(
  [
    ...[...TEA, ...DRIED_ONLY, ...EITHER, ...VEGETABLES, ...FRESH_FRUIT, ...JUICES, ...LEXICON.flatMap((l) => l.terms)].map((t) => t.re.source),
    ...CATEGORIES,
  ].flatMap((source) =>
    // "cheeses?" and "tomato(es)?" stand for "cheese" and "tomato" as well.
    [source, source.replace(/\((?:e?s)\)\?|s\?/g, "")].flatMap((s) => s.toLowerCase().replace(/\\[a-z]/g, " ").match(/[a-z]{3,}/g) ?? []),
  ),
);
