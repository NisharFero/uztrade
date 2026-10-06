/* One-off: lane split across the whole corpus and how many online agent steps
 * an entity API can actually file. Run with `npx tsx scripts/debug/corpus-coverage.ts`. */
import { readdirSync, readFileSync } from "node:fs";
import { delegationOfStep } from "../../modules/procedures/delegation";
import { portalTargetOf } from "../../modules/portals/targets";

const lanes: Record<string, number> = { user: 0, agent: 0, physical: 0 };
let onlineAgent = 0;
let mapped = 0;
for (const file of readdirSync("public/data/procedures")) {
  const p = JSON.parse(readFileSync(`public/data/procedures/${file}`, "utf8"));
  for (const b of p.blocks)
    for (const s of b.steps) {
      const lane = delegationOfStep(s).lane;
      lanes[lane] = (lanes[lane] ?? 0) + 1;
      if (lane === "agent" && /online/i.test(s.channel ?? "")) {
        onlineAgent += 1;
        if (portalTargetOf(s)) mapped += 1;
      }
    }
}
console.log(JSON.stringify({ lanes, onlineAgent, mapped }));
