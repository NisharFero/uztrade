/* One-off: entity names in the corpus that no counterparty rule recognises -
 * they would fall back to "government" instead of being classified. */
import { readdirSync, readFileSync } from "node:fs";
import { COUNTERPARTY_RULES } from "../../modules/procedures/actors";

const seen = new Map<string, number>();
for (const file of readdirSync("public/data/procedures")) {
  const p = JSON.parse(readFileSync(`public/data/procedures/${file}`, "utf8"));
  for (const b of p.blocks) for (const s of b.steps) if (s.entity) seen.set(s.entity, (seen.get(s.entity) ?? 0) + 1);
}
const missed = [...seen].filter(([e]) => !COUNTERPARTY_RULES.some(([re]) => re.test(e))).sort((a, b) => b[1] - a[1]);
console.log(`${seen.size} entity names, ${missed.length} unclassified`);
for (const [e, n] of missed) console.log(`${String(n).padStart(4)}  ${e}`);
