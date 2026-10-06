/* How a category of goods travels.
 *
 * Two planning facts the whole application keeps asking for, in one place:
 *
 *   chain  - does the load need refrigeration, and is it perishable? This
 *            decides the wagon type, the equipment the Transit agent asks for,
 *            and how much clearance delay the Risk agent treats as safe.
 *   band   - how much one wagon, truck or container actually holds. Cement
 *            reaches the 68 t limit; carpets fill the space at a fraction of
 *            it. Which of the two runs out first is what matters.
 *
 * These are **planning defaults, not regulatory facts**. They size a shipment
 * and raise warnings; they never assert what a rule requires, and anything the
 * trader declares wins over them (see `declared` in modules/transit/transit.ts).
 * A category nobody has characterised is ambient and standard, which is the
 * safe reading rather than a guess.
 *
 * Before the corpus grew to 243 procedures only "fresh fruits and vegetables"
 * was ever treated as perishable, so a case for yoghurt planned a dry covered
 * wagon and the Risk agent called it shelf-stable.
 */

/** Temperature the load travels at. "chilled" covers anything needing a reefer;
 *  nothing in the corpus is published as frozen. */
export type Chain = "ambient" | "chilled";

/** What fills first: the weight limit, or the space. */
export type Band = "dense" | "standard" | "bulky" | "light";

export type Handling = { chain: Chain; band: Band };

const DEFAULT: Handling = { chain: "ambient", band: "standard" };

const HANDLING: Record<string, Handling> = {
  /* Cold chain. */
  "fresh fruits and vegetables": { chain: "chilled", band: "bulky" },
  "dairy products": { chain: "chilled", band: "standard" },
  "meat and meat products": { chain: "chilled", band: "standard" },
  eggs: { chain: "chilled", band: "bulky" },
  "pharmaceutical products": { chain: "chilled", band: "light" },

  /* Weight-limited: they reach the wagon's limit with room to spare. */
  cement: { chain: "ambient", band: "dense" },
  salt: { chain: "ambient", band: "dense" },
  flour: { chain: "ambient", band: "dense" },
  cereals: { chain: "ambient", band: "dense" },
  "mineral fertilizers": { chain: "ambient", band: "dense" },
  "animal or vegetable fertilizers": { chain: "ambient", band: "dense" },
  "seed oil": { chain: "ambient", band: "dense" },
  "vegetable oils": { chain: "ambient", band: "dense" },
  "vegetable oils for consumers' use and consumption": { chain: "ambient", band: "dense" },
  "vegetable oils for technical or industrial use": { chain: "ambient", band: "dense" },
  "fruit and vegetable juices": { chain: "ambient", band: "dense" },
  "carbonated beverages": { chain: "ambient", band: "dense" },
  honey: { chain: "ambient", band: "dense" },
  "glass and glass products": { chain: "ambient", band: "dense" },
  "paper and cardboard products": { chain: "ambient", band: "standard" },
  wood: { chain: "ambient", band: "standard" },

  /* Volume-limited: the space runs out long before the weight does. */
  tea: { chain: "ambient", band: "bulky" },
  "dried fruits": { chain: "ambient", band: "standard" },
  carpets: { chain: "ambient", band: "bulky" },
  fabrics: { chain: "ambient", band: "bulky" },
  "textile and garment": { chain: "ambient", band: "bulky" },
  shoes: { chain: "ambient", band: "bulky" },
  "perfumery, cosmetic or toilet preparations": { chain: "ambient", band: "bulky" },
  furniture: { chain: "ambient", band: "light" },
  "reusable packaging": { chain: "ambient", band: "light" },
  "medical equipment": { chain: "ambient", band: "light" },
  jewelry: { chain: "ambient", band: "light" },
};

export function handlingFor(goods: string): Handling {
  return HANDLING[goods] ?? DEFAULT;
}

/** Goods whose clearance delay costs them condition, not just time. */
export const isPerishable = (goods: string): boolean => handlingFor(goods).chain === "chilled";

/* Tonnes one unit carries, by band. The published weight limits are higher;
   these are what the space allows. */
const WAGON_BY_BAND: Record<Band, number> = { dense: 60, standard: 30, bulky: 22, light: 12 };
const TRUCK_BY_BAND: Record<Band, number> = { dense: 22, standard: 20, bulky: 15, light: 8 };
const CONTAINER_BY_BAND: Record<Band, number> = { dense: 24, standard: 18, bulky: 16, light: 8 };

export const wagonTonnesFor = (goods: string): number => WAGON_BY_BAND[handlingFor(goods).band];
export const truckTonnesFor = (goods: string): number => TRUCK_BY_BAND[handlingFor(goods).band];
export const containerTonnesFor = (goods: string): number => CONTAINER_BY_BAND[handlingFor(goods).band];
