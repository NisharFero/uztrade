/* Corpus-wide routing and resumability.
 *
 * Each published procedure is selected through the same intake classifier the
 * case API uses, loaded, instantiated, and then advanced from serialized state
 * only. Serializing after every wave deliberately discards local object
 * identity: completion must depend on persisted workflow state, not on chat or
 * model context left in memory. */
import { readdirSync } from "node:fs";
import { classify } from "../../modules/intake/classify";
import { CATALOGUE, PROCEDURE_IDS } from "../../modules/procedures/data/procedures.generated";
import { requireProcedure } from "../../modules/procedures/registry";
import { instantiateWorkflow, reconcileNodes, type WorkflowNodeDefinition } from "../../modules/workflow/domain";
import type { CaseResult, Suite } from "../types";

function sourceIds(): string[] {
  const root = "../../Docs/Procedures";
  return [...new Set(readdirSync(root)
    .map((name) => name.match(/^Procedure_(\d+)_.*\.docx$/i)?.[1])
    .filter((id): id is string => Boolean(id)))]
    .sort((a, b) => Number(a) - Number(b));
}

function finishFromPersistedState(nodes: WorkflowNodeDefinition[], edges: ReturnType<typeof instantiateWorkflow>["edges"]): WorkflowNodeDefinition[] {
  let persisted = JSON.stringify(nodes);
  for (let wave = 0; wave <= nodes.length; wave += 1) {
    const restored = JSON.parse(persisted) as WorkflowNodeDefinition[];
    const reconciled = reconcileNodes(restored, edges);
    const ready = reconciled.filter((node) => node.state === "ready");
    if (!ready.length) return reconciled;
    for (const node of ready) node.state = node.optional ? "skipped" : "completed";
    persisted = JSON.stringify(reconciled);
  }
  throw new Error("workflow did not settle within one wave per step");
}

export const procedureExecutionSuite: Suite = {
  name: "procedure-execution",
  about: "Every source procedure is directly routable, loadable, and can resume from serialized state through every dependency to completion.",
  async run(options): Promise<CaseResult[]> {
    const source = sourceIds();
    const catalogue = [...PROCEDURE_IDS].sort((a, b) => Number(a) - Number(b));
    const results: CaseResult[] = [{
      id: "source documents equal catalogue",
      ok: JSON.stringify(source) === JSON.stringify(catalogue),
      detail: `${source.length} unique DOCX ids, ${catalogue.length} catalogue rows`,
    }];

    for (const id of PROCEDURE_IDS.slice(0, options.limit ?? PROCEDURE_IDS.length)) {
      try {
        const match = await classify(`Start procedure ${id}`);
        const procedure = await requireProcedure(id);
        const workflow = instantiateWorkflow(procedure, `eval-${id}`);
        const final = finishFromPersistedState(workflow.nodes, workflow.edges);
        const unfinished = final.filter((node) => node.state !== "completed" && node.state !== "skipped");
        const stepCount = procedure.blocks.reduce((sum, block) => sum + block.steps.length, 0);
        const wrong = [
          match.procedureId !== id ? `routed to ${match.procedureId ?? "none"}` : "",
          !match.plan ? "no step plan" : "",
          match.plan && match.plan.totalSteps !== stepCount ? `plan has ${match.plan.totalSteps}/${stepCount} steps` : "",
          unfinished.length ? `${unfinished.length} steps stranded` : "",
        ].filter(Boolean);
        results.push({ id: `${id} ${CATALOGUE[id].title}`, ok: !wrong.length, detail: wrong.join("; ") || (options.verbose ? `${stepCount} steps completed from persisted state` : undefined) });
      } catch (error) {
        results.push({ id: `${id} ${CATALOGUE[id].title}`, ok: false, detail: (error as Error).message.slice(0, 180) });
      }
    }
    return results;
  },
};
