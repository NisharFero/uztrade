/* Harmonized System subheadings for the goods the procedures cover.
 *
 * An extract of the WCO Harmonized System 2022 at 6 digits - the level every
 * country shares. Uzbekistan's national tariff adds 4 more digits (10 in all);
 * those subdivisions are NOT in this extract, so a 10-digit code built from it
 * ends in 0000 and says so. Replace this file with the national nomenclature
 * when it is sourced. */

export const HS_SOURCE = "WCO Harmonized System 2022, 6-digit subheadings (extract for the goods in scope)";
/* Rail logistics (782, 924) carries any cargo and classifies nothing, so it has no entries here. */

export type HsSubheading = { code: string; description: string; keywords: string[] };

export const HS_SUBHEADINGS: HsSubheading[] = [
  { code: "090210", description: "Green tea (not fermented), in immediate packings of a content not exceeding 3 kg", keywords: ["green", "зелен", "yashil", "small pack"] },
  { code: "090220", description: "Other green tea (not fermented)", keywords: ["green", "зелен", "yashil", "bulk"] },
  { code: "090230", description: "Black tea (fermented) and partly fermented tea, in immediate packings of a content not exceeding 3 kg", keywords: ["black", "черн", "qora", "small pack"] },
  { code: "090240", description: "Other black tea (fermented) and other partly fermented tea", keywords: ["black", "черн", "qora", "bulk"] },

  { code: "070200", description: "Tomatoes, fresh or chilled", keywords: ["tomato", "томат", "помидор", "pomidor"] },
  { code: "070110", description: "Seed potatoes, fresh or chilled", keywords: ["seed potato", "семенн"] },
  { code: "070190", description: "Potatoes, fresh or chilled (other than seed)", keywords: ["potato", "картоф", "kartoshka"] },
  { code: "070310", description: "Onions and shallots, fresh or chilled", keywords: ["onion", "лук", "piyoz", "shallot"] },
  { code: "070320", description: "Garlic, fresh or chilled", keywords: ["garlic", "чеснок", "sarimsoq"] },
  { code: "070410", description: "Cauliflowers and broccoli, fresh or chilled", keywords: ["cauliflower", "broccoli", "цветн"] },
  { code: "070490", description: "Cabbages and similar edible brassicas, fresh or chilled (other)", keywords: ["cabbage", "капуст", "karam"] },
  { code: "070610", description: "Carrots and turnips, fresh or chilled", keywords: ["carrot", "морков", "sabzi", "turnip"] },
  { code: "070700", description: "Cucumbers and gherkins, fresh or chilled", keywords: ["cucumber", "огур", "bodring", "gherkin"] },
  { code: "070960", description: "Fruits of the genus Capsicum or Pimenta (peppers), fresh or chilled", keywords: ["pepper", "перец", "qalampir", "capsicum"] },

  { code: "080510", description: "Oranges, fresh or dried", keywords: ["orange", "апельсин"] },
  { code: "080521", description: "Mandarins (including tangerines and satsumas)", keywords: ["mandarin", "tangerine", "мандарин"] },
  { code: "080550", description: "Lemons and limes", keywords: ["lemon", "lime", "лимон", "limon"] },
  { code: "080610", description: "Grapes, fresh", keywords: ["grape", "виноград", "uzum", "fresh"] },
  { code: "080620", description: "Grapes, dried (raisins)", keywords: ["raisin", "sultana", "изюм", "кишмиш", "mayiz", "dried grape"] },
  { code: "080711", description: "Watermelons, fresh", keywords: ["watermelon", "арбуз", "tarvuz"] },
  { code: "080719", description: "Melons (other than watermelons), fresh", keywords: ["melon", "дын", "qovun"] },
  { code: "080810", description: "Apples, fresh", keywords: ["apple", "яблок", "olma"] },
  { code: "080830", description: "Pears, fresh", keywords: ["pear", "груш", "nok"] },
  { code: "080840", description: "Quinces, fresh", keywords: ["quince", "айва", "behi"] },
  { code: "080910", description: "Apricots, fresh", keywords: ["apricot", "абрикос", "o'rik", "fresh"] },
  { code: "080921", description: "Sour cherries (Prunus cerasus), fresh", keywords: ["sour cherr", "вишн", "olcha"] },
  { code: "080929", description: "Cherries (other than sour cherries), fresh", keywords: ["cherr", "черешн", "gilos"] },
  { code: "080930", description: "Peaches, including nectarines, fresh", keywords: ["peach", "nectarine", "персик", "shaftoli"] },
  { code: "080940", description: "Plums and sloes, fresh", keywords: ["plum", "слив", "olxo'ri"] },
  { code: "081010", description: "Strawberries, fresh", keywords: ["strawberr", "клубник", "qulupnay"] },
  { code: "081090", description: "Other fruit, fresh (e.g. pomegranates, persimmons)", keywords: ["pomegranate", "persimmon", "гранат", "хурм", "anor", "xurmo"] },

  { code: "081310", description: "Apricots, dried", keywords: ["dried apricot", "kuraga", "курага", "урюк", "turshak", "apricot"] },
  { code: "081320", description: "Prunes", keywords: ["prune", "чернослив"] },
  { code: "081330", description: "Apples, dried", keywords: ["dried apple", "сушен яблок", "apple"] },
  { code: "081340", description: "Other dried fruit", keywords: ["dried", "сушен", "quritilgan", "fig", "cherr", "pear"] },
  { code: "081350", description: "Mixtures of nuts or dried fruits", keywords: ["mixture", "mix", "ассорти", "смесь"] },

  { code: "200911", description: "Orange juice, frozen", keywords: ["frozen orange", "замороженн"] },
  { code: "200912", description: "Orange juice, not frozen, of a Brix value not exceeding 20", keywords: ["orange", "апельсинов"] },
  { code: "200919", description: "Orange juice, other", keywords: ["orange concentrate", "concentrate"] },
  { code: "200950", description: "Tomato juice", keywords: ["tomato", "томатн", "pomidor"] },
  { code: "200961", description: "Grape juice (including grape must), of a Brix value not exceeding 30", keywords: ["grape", "виноградн", "uzum"] },
  { code: "200969", description: "Grape juice (including grape must), other", keywords: ["grape concentrate", "grape must"] },
  { code: "200971", description: "Apple juice, of a Brix value not exceeding 20", keywords: ["apple", "яблочн", "olma"] },
  { code: "200979", description: "Apple juice, other", keywords: ["apple concentrate"] },
  { code: "200989", description: "Juice of any other single fruit or vegetable", keywords: ["cherry", "pomegranate", "apricot", "carrot", "гранат", "абрикос", "морков", "nectar"] },
  { code: "200990", description: "Mixtures of juices", keywords: ["mix", "multifruit", "мультифрукт", "смесь"] },

  { code: "310100", description: "Animal or vegetable fertilisers, whether or not mixed together or chemically treated; fertilisers produced by the mixing or chemical treatment of animal or vegetable products", keywords: ["manure", "compost", "guano", "biohumus", "organic", "навоз", "компост", "биогумус", "go'ng"] },
];
