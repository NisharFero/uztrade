/* Messy intake messages: Russian or Uzbek, typos, "2 fura", "вывозим чай".
 * When the rules don't understand a message, a model reads it into the intake
 * slots and the message is restated in the plain English the rules parse
 * ("export 20 tonnes of tea from Tashkent to Almaty by train"). The rules then
 * decide everything - published procedures, route, quantity - exactly as for
 * a typed message, and the trader is shown what was understood.
 *
 * Only what resolves locally survives: goods the commodity table knows, places
 * the gazetteer knows, and units the rules measure. A name the model invents is
 * dropped; a count of pallets is not read as tonnes. */

import { z } from "zod";
import { llmJson, type LlmClient } from "../ai/llm";
import type { Slot } from "./draft";
import { isProcedureQuestion } from "./relevance";
import { placesIn } from "./shipment-plan";
import { commodityOf } from "./taxonomy";

const Extracted = z.object({
  shipment: z.boolean(),
  goods: z.string().nullish(),
  direction: z.enum(["export", "import"]).nullish(),
  mode: z.enum(["train", "air", "road"]).nullish(),
  quantity: z.number().positive().nullish(),
  /** As the model read it - checked against the units the rules measure (unitOf). */
  unit: z.string().nullish(),
  origin: z.string().nullish(),
  destination: z.string().nullish(),
});
export type Extracted = z.infer<typeof Extracted>;

const QUESTION: Record<Slot, string> = {
  commodity: "what goods are moving",
  direction: "export from or import into Uzbekistan",
  mode: "how the goods travel",
  quantity: "how much",
  route: "from where to where",
};

const SYSTEM = [
  "You read a trader's message about moving goods to or from Uzbekistan. It may be in English, Russian or Uzbek (Latin or Cyrillic) and may have typos.",
  "Extract only what the message states. Use null for anything it doesn't state; never guess.",
  "goods: a common English noun, e.g. tea, tomatoes, raisins, dried apricots. places: the English name of the city or country, e.g. Tashkent, Almaty, Russia.",
  "direction: export = out of Uzbekistan, import = into Uzbekistan. mode: train (rail, wagon, vagon), air (plane, avia), road (truck, fura).",
  "quantity: the number stated; unit: tonnes, kg, wagons, containers, or the word the message uses (e.g. trucks). shipment=false if the message isn't about moving goods.",
  "JSON keys: shipment, goods, direction, mode, quantity, unit, origin, destination.",
].join("\n");

const UNITS: [RegExp, string][] = [
  [/^(t|tn|tons?|tonnes?|tonna|тонн?[аы]?|т)$/i, "tonnes"],
  [/^(kg|kgs|kilo(gram)?s?|кг|килограмм(ов|а)?)$/i, "kg"],
  [/^(wagons?|vagon(lar)?|вагон(а|ов)?|railcars?)$/i, "wagons"],
  [/^(containers?|konteyner(lar)?|контейнер(а|ов)?)$/i, "containers"],
  [/^(trucks?|lorry|lorries|furas?|fura(lar)?|фур(а|ы)?)$/i, "trucks"],
];

/** A unit the rules measure goods in; null for one they don't (pallets, boxes). */
export const unitOf = (raw: string): string | null => UNITS.find(([re]) => re.test(raw.trim()))?.[1] ?? null;

/** Rules first: a model is asked only about a message they couldn't read, or one in Cyrillic script. */
export function needsModel(message: string, understood: boolean, declined: boolean): boolean {
  if (isProcedureQuestion(message)) return false;
  return declined || !understood || /[Ѐ-ӿ]/.test(message);
}

/** The extraction restated in the words the rules parse; empty when nothing resolved. */
export function restate(x: Extracted, expecting: Slot | null): string {
  const goodsHit = x.goods ? commodityOf(x.goods) : { kind: "none" as const };
  const goods = goodsHit.kind === "none" ? null : x.goods!.trim().toLowerCase();
  const place = (name: string | null | undefined) => (name && placesIn(name).length ? placesIn(name)[0].place.name : null);
  const origin = place(x.origin);
  const destination = place(x.destination);
  // No unit stated reads as tonnes, as the rules read a bare number; a unit they don't measure drops the count.
  const unit = x.unit?.trim() ? unitOf(x.unit) : "tonnes";
  const quantity = unit ? x.quantity : null;

  const parts: string[] = [];
  if (x.direction) parts.push(x.direction);
  if (quantity) parts.push(`${quantity} ${unit}`);
  if (goods) parts.push(quantity ? `of ${goods}` : goods);
  // One bare place answering the route question: let the rules decide which end it is.
  if (expecting === "route" && Boolean(origin) !== Boolean(destination) && !x.direction) {
    parts.push((origin ?? destination)!);
  } else {
    if (origin) parts.push(`from ${origin}`);
    if (destination) parts.push(`to ${destination}`);
  }
  if (x.mode) parts.push(`by ${x.mode}`);
  return parts.join(" ").trim();
}

export async function understandWithModel(message: string, expecting: Slot | null, llm: LlmClient | undefined): Promise<{ text: string; model: string } | null> {
  const answer = await llmJson(llm, {
    sensitivity: "public",
    system: SYSTEM,
    prompt: JSON.stringify({ message, question: expecting ? QUESTION[expecting] : null }),
    schema: Extracted,
    maxTokens: 800,
  });
  if (!answer?.data.shipment) return null;
  const text = restate(answer.data, expecting);
  return text ? { text, model: answer.model } : null;
}
