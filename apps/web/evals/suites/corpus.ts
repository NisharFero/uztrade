/* The corpus itself: what every published procedure must hold.
 *
 * This is the suite that fails first when a document is re-parsed wrongly or a
 * generator changes shape, because everything else - intake, the agents, the
 * planning - reads from here.
 */
import { readFileSync, readdirSync } from "node:fs";
import { CATALOGUE, PROCEDURE_IDS, type Procedure } from "../../modules/procedures/data/procedures.generated";
import type { CaseResult, Suite } from "../types";

const DIR = "public/data/procedures";

const DIRECTIONS = new Set(["import", "export", "transit"]);
const MODES = new Set(["train", "air", "road", "any"]);
const KINDS = new Set(["customs", "logistics", "service"]);
const REGIMES = new Set(["standard", "clearance", "temporary", "re-export", "transit", "service"]);

export const corpusSuite: Suite = {
  name: "corpus",
  about: "Every published procedure: its taxonomy, its graph, and a workflow file that matches its catalogue row.",
  async run(): Promise<CaseResult[]> {
    const results: CaseResult[] = [];
    const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));

    results.push({
      id: "every catalogue row has a workflow file",
      ok: files.length === PROCEDURE_IDS.length,
      detail: `${files.length} files, ${PROCEDURE_IDS.length} catalogue rows`,
    });

    const taxonomyBad: string[] = [];
    const countsBad: string[] = [];
    const graphBad: string[] = [];
    let inputsBad = 0;
    let steps = 0;

    for (const id of PROCEDURE_IDS) {
      const row = CATALOGUE[id];
      if (!DIRECTIONS.has(row.direction) || !MODES.has(row.mode) || !KINDS.has(row.kind) || !REGIMES.has(row.regime) || !row.goods) {
        taxonomyBad.push(id);
      }

      let p: Procedure;
      try {
        p = JSON.parse(readFileSync(`${DIR}/${id}.json`, "utf8")) as Procedure;
      } catch {
        countsBad.push(`${id} (unreadable)`);
        continue;
      }

      const fileSteps = p.blocks.reduce((n, b) => n + b.steps.length, 0);
      if (p.blocks.length !== row.blocksCount || fileSteps !== row.stepsCount) {
        countsBad.push(`${id} (${p.blocks.length}/${fileSteps} vs ${row.blocksCount}/${row.stepsCount})`);
      }
      steps += fileSteps;

      const ids = new Set(p.blocks.map((b) => b.id));
      const state = new Map<string, "open" | "done">();
      const byId = new Map(p.blocks.map((b) => [b.id, b]));
      const visit = (node: string): boolean => {
        const seen = state.get(node);
        if (seen === "done") return true;
        if (seen === "open") return false; // a cycle
        state.set(node, "open");
        for (const dep of byId.get(node)?.dependsOn ?? []) {
          if (!ids.has(dep) || !visit(dep)) return false;
        }
        state.set(node, "done");
        return true;
      };
      if (!p.blocks.every((b) => visit(b.id)) || !p.blocks.some((b) => !b.dependsOn.length)) graphBad.push(id);

      for (const b of p.blocks) for (const s of b.steps) if (!s.inputs?.length) inputsBad += 1;
    }

    results.push({ id: "taxonomy is one of the published values", ok: !taxonomyBad.length, detail: taxonomyBad.slice(0, 5).join(", ") });
    results.push({ id: "workflow counts match the catalogue", ok: !countsBad.length, detail: countsBad.slice(0, 5).join(", ") });
    results.push({ id: "every graph is acyclic and has a root", ok: !graphBad.length, detail: graphBad.slice(0, 5).join(", ") });
    results.push({
      id: "steps carry the inputs their document lists",
      ok: inputsBad <= 1,
      detail: `${inputsBad} of ${steps} steps have none (1 is published without any)`,
    });

    return results;
  },
};
