/* One-off: does every published goods category have words a trader would use? */
import { CATEGORIES, commodityOf } from "../../modules/intake/taxonomy";

const probes: Record<string, string[]> = {
  "tea": ["export tea by train"],
  "dried fruits": ["export raisins"],
  "fresh fruits and vegetables": ["export tomatoes"],
  "fruit and vegetable juices": ["export apple juice"],
  "animal or vegetable fertilizers": ["import organic fertilizer"],
  "mineral fertilizers": ["import urea fertilizer"],
  "dairy products": ["import yoghurt", "import milk by road", "export cheese"],
  "meat and meat products": ["import beef", "export sausages"],
  "eggs": ["export eggs by train"],
  "honey": ["export honey by air"],
  "confectionery": ["export chocolate", "import biscuits"],
  "pasta": ["import pasta by road"],
  "flour": ["import flour by train"],
  "cereals": ["import wheat by train"],
  "salt": ["export salt by train"],
  "coffee": ["import coffee by air"],
  "carbonated beverages": ["import soft drinks by train"],
  "seed oil": ["export sunflower oil by road"],
  "vegetable oils for consumers' use and consumption": ["import edible vegetable oil by road"],
  "vegetable oils for technical or industrial use": ["import technical vegetable oil by road"],
  "vegetable oils": ["export vegetable oils by train"],
  "pharmaceutical products": ["import medicines by air"],
  "medical equipment": ["import medical equipment by road"],
  "perfumery, cosmetic or toilet preparations": ["export perfume by air"],
  "washing detergents": ["import washing powder by train"],
  "cotton yarn": ["export cotton yarn by train"],
  "fabrics": ["export fabrics by road"],
  "textile and garment": ["export garments by train"],
  "carpets": ["export carpets by road"],
  "shoes": ["export shoes by train"],
  "jewelry": ["export jewelry by air"],
  "furniture": ["export furniture by train"],
  "wood": ["import timber by road"],
  "paper and cardboard products": ["import cardboard by train"],
  "glass and glass products": ["import glassware by road"],
  "cement": ["export cement by train"],
  "reusable packaging": ["export reusable packaging by road"],
  "any cargo": ["arrange cargo transportation by train"],
};

let bad = 0;
for (const category of CATEGORIES) {
  const words = probes[category];
  if (!words) {
    console.log(`MISSING PROBE  ${category}`);
    bad += 1;
    continue;
  }
  for (const text of words) {
    const hit = commodityOf(text);
    const ok = hit.kind === "known" && hit.category === category;
    if (!ok) {
      console.log(`MISS  ${category.padEnd(46)} "${text}" -> ${JSON.stringify(hit)}`);
      bad += 1;
    }
  }
}
console.log(bad ? `\n${bad} categories unreachable` : `\nall ${CATEGORIES.length} categories reachable from a trader's words`);

const byName = CATEGORIES.filter((c) => {
  if (c === "any cargo") return false; // reached through the logistics wording
  const h = commodityOf(`export ${c} by train`);
  return !(h.kind === "known" && h.category === c);
});
console.log(byName.length ? `categories not matched by their own name: ${byName.join(", ")}` : "every category also matches its own name");
