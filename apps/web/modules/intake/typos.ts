/* Misspellings of words the app knows, put right before anything reads them.
 *
 * "i want to move taea by tarain from tashkent to almaty" names tea, a train
 * and two cities - the rules just cannot see them. A model can, but only when
 * one is configured and within its rate limit, and it reads the goods as
 * "something unpublished" often enough to propose tea as the nearest category
 * of tea. So the vocabulary the rules already use - the goods the taxonomy
 * recognises, the places the gazetteer knows, the words for modes and
 * directions - is used to correct the message first.
 *
 * Deliberately narrow: a word is only changed when it is not already a word
 * the app knows or a common English word, when exactly one vocabulary word is
 * one edit away (two for words of seven letters or more, counting a swap of
 * neighbours as one edit), and when that word starts with the same letter.
 * Anything less certain is left for the model.
 */

import { GOODS_WORDS } from "./taxonomy";
import { PLACE_WORDS } from "./shipment-plan";
import { procedureTitleCandidates } from "./reference";

const TRADE_WORDS = [
  "export", "import", "exporting", "importing", "transit", "train", "rail", "railway", "road", "truck", "trucks", "lorry",
  "flight", "plane", "wagon", "wagons", "container", "tonnes", "tons", "kilograms", "customs", "clearance", "shipment",
  "certificate", "phytosanitary", "procedure", "documents", "transport", "cargo", "freight",
];

/** Words people write that sit one letter from a vocabulary word ("rain",
 *  "real", "tree") and must never be "corrected". */
const COMMON: ReadonlySet<string> = new Set(
  (
    "a want need move from will take much long have with this that what when where which would could should there their about into just like " +
    "make some time them then than been were your more also only over such many most other rain real tree tray send ship bring plan planning " +
    "thinking going gonna wanna does done tell show know help please thanks hello good best cost price pay paid week weeks days hours month " +
    "year company goods items stuff them they here area road route city town port sale sell sold buy bought deal team same sure okay fine " +
    "start begin open close case cases step steps next last first once able does doing made main mean meant near nearly"
  ).split(" "),
);

const VOCABULARY: string[] = [...new Set([...GOODS_WORDS, ...PLACE_WORDS, ...TRADE_WORDS])].filter((w) => w.length >= 3);
const KNOWN = new Set(VOCABULARY);
/** A word the app knows, in the singular or the plural: the tables write
 *  "cheeses?" and "shipment", traders write "cheese" and "shipments". */
const isKnown = (w: string) =>
  KNOWN.has(w) || KNOWN.has(`${w}s`) || KNOWN.has(`${w}es`) || (w.endsWith("s") && KNOWN.has(w.slice(0, -1))) || (w.endsWith("es") && KNOWN.has(w.slice(0, -2)));

/** Edit distance where swapping two neighbouring letters costs one. */
function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** The one vocabulary word a misspelling stands for, or null. */
export function correction(word: string): string | null {
  const w = word.toLowerCase();
  if (w.length < 4 || isKnown(w) || COMMON.has(w)) return null;
  const limit = w.length >= 7 ? 2 : 1;
  let best: string | null = null;
  let bestDistance = limit + 1;
  let tied = false;
  for (const candidate of VOCABULARY) {
    if (candidate[0] !== w[0]) continue;
    const dist = distance(w, candidate, limit);
    if (dist < bestDistance) {
      best = candidate;
      bestDistance = dist;
      tied = false;
    } else if (dist === bestDistance && candidate !== best) {
      tied = true;
    }
  }
  return best && !tied && bestDistance <= limit ? best : null;
}

export type Corrected = { text: string; fixes: { from: string; to: string }[] };

export function correctTypos(text: string): Corrected {
  if (procedureTitleCandidates(text).length) return { text, fixes: [] };
  const fixes: Corrected["fixes"] = [];
  const corrected = text.replace(/[A-Za-z]{4,}/g, (word) => {
    const to = correction(word);
    if (!to) return word;
    fixes.push({ from: word, to });
    return to;
  });
  return { text: corrected, fixes };
}
