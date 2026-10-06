/* The words a trader uses, against the category the corpus publishes.
 *
 * Gold is checked first: a row naming a category the corpus does not publish
 * is bad gold, not a product failure.
 */
import { readFileSync } from "node:fs";
import { CATEGORIES, commodityOf } from "../../modules/intake/taxonomy";
import type { CaseResult, Suite } from "../types";

type Row = { words: string; category: string | null; term?: string; hs?: string; why?: string };

export const taxonomySuite: Suite = {
  name: "taxonomy",
  about: "Product words to published goods categories, including the readings that are easy to get wrong.",
  async run(): Promise<CaseResult[]> {
    const gold = JSON.parse(readFileSync("evals/gold/taxonomy.json", "utf8")) as { cases: Row[] };
    const results: CaseResult[] = [];

    for (const row of gold.cases) {
      const id = `"${row.words}"`;
      if (row.category && !CATEGORIES.includes(row.category)) {
        results.push({ id, ok: false, badGold: true, detail: `no published category "${row.category}"` });
        continue;
      }

      const hit = commodityOf(row.words);
      if (row.category === null) {
        // Nothing published covers these words; anything but a confident read
        // is the right answer.
        if (hit.kind === "known") {
          results.push({ id, ok: false, detail: `read as ${hit.term} (${hit.category})` });
        } else {
          results.push({ id, ok: true });
        }
        continue;
      }

      if (hit.kind !== "known") {
        results.push({ id, ok: false, detail: `expected ${row.category}, got ${hit.kind}` });
        continue;
      }
      const wrong: string[] = [];
      if (hit.category !== row.category) wrong.push(`category ${hit.category} ≠ ${row.category}`);
      if (row.term && hit.term !== row.term) wrong.push(`term "${hit.term}" ≠ "${row.term}"`);
      if (row.hs && hit.hs !== row.hs) wrong.push(`HS ${hit.hs || "—"} ≠ ${row.hs}`);
      results.push({ id, ok: !wrong.length, detail: wrong.join("; ") });
    }

    // Coverage: a category no words reach cannot be asked for.
    const reached = new Set<string>();
    for (const row of gold.cases) {
      const hit = commodityOf(row.words);
      if (hit.kind === "known") reached.add(hit.category);
    }
    const unreached = CATEGORIES.filter((c) => !reached.has(c));
    results.push({
      id: "every published category is reachable from the gold words",
      ok: unreached.length === 0,
      detail: unreached.join(", "),
    });

    return results;
  },
};
