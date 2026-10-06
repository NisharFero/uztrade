/* One-off: goods words that also name a place.
 *
 * "export walnuts to Turkey by air" must not be read as poultry. Every city and
 * country the gazetteer knows is run through the commodity lexicon, so a
 * collision is found here rather than in a trader's case.
 */
import { COUNTRIES } from "../../modules/intake/data/countries";
import { placesForCountry } from "../../modules/intake/shipment-plan";
import { commodityOf } from "../../modules/intake/taxonomy";

const places = new Set<string>();
for (const country of Object.values(COUNTRIES)) {
  places.add(country.name);
  for (const place of placesForCountry(country.iso)) places.add(place.name);
}
// The spellings traders type, which the fixture's own names do not cover
// (it calls Turkiye "Turkiye", and they write "Turkey").
for (const alias of ["Turkey", "Turkiye", "Russia", "Russian Federation", "China", "Kazakhstan", "Kyrgyzstan", "Afghanistan", "Uzbekistan"]) {
  places.add(alias);
}

let collisions = 0;
for (const place of [...places].sort()) {
  const hit = commodityOf(`export something to ${place} by air`);
  if (hit.kind === "known" || hit.kind === "ambiguous") {
    const as = hit.kind === "known" ? `${hit.term} (${hit.category})` : `ambiguous ${hit.term}`;
    console.log(`COLLISION  "${place}" reads as ${as}`);
    collisions += 1;
  }
}
console.log(collisions ? `\n${collisions} of ${places.size} place names read as goods` : `\nnone of the ${places.size} known places reads as goods`);
