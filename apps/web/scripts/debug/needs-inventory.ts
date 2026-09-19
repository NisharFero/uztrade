/* Everything a full walk-through of each procedure needs from the trader,
 * derived from the step engine itself (the same needs the step assistant shows). */
import { PROCEDURES, PROCEDURE_IDS } from "../../modules/procedures/sync";
import { instantiateWorkflow } from "../../modules/workflow/domain";
import { buildLedger } from "../../modules/steps/ledger";
import { stepViewFor } from "../../modules/steps/next";
import type { WorkflowProjection } from "../../modules/workflow/repository";

const union = new Map<string, Set<string>>();
for (const id of PROCEDURE_IDS) {
  const procedure = PROCEDURES[id];
  const runId = `inventory:${id}`;
  const workflow = instantiateWorkflow(procedure, runId);
  const projection: WorkflowProjection = {
    run: { id: runId, caseId: "inventory", procedureVersionId: `procedure:${id}:v1`, status: "running", cycle: 0 },
    shipmentFacts: { goods: "", quantity: null, unit: null, origin: null, destination: null, mode: null },
    nodes: workflow.nodes, edges: workflow.edges, workItems: [], agentRuns: [], artifacts: [], auditEvents: [],
  };
  const ledger = buildLedger([]);
  const docs = new Map<string, string>();
  const outputs = new Map<string, string>();
  const untyped = new Set<string>();
  const values = new Set<string>();
  let confirms = 0;
  let variantSteps = 0;
  for (const node of workflow.nodes) {
    const view = stepViewFor(procedure, projection, ledger, node);
    if (view.variants.length) variantSteps++;
    for (const need of [...view.needs, ...view.variants.flatMap((v) => v.needs)]) {
      if (need.kind === "document" && need.docType) (need.output ? outputs : docs).set(need.label, need.docType);
      else if (need.kind === "document") untyped.add(need.label);
      else if (need.kind === "value") values.add(need.label);
      else if (need.kind === "confirm") confirms++;
      if (need.kind === "document" && need.docType) union.set(need.docType, new Set([...(union.get(need.docType) ?? []), id]));
    }
  }
  console.log(`\n== ${id} ${procedure.title}: ${workflow.nodes.length} steps`);
  console.log(`  parsed documents (${docs.size}): ${[...docs].map(([l, t]) => `${l} [${t}]`).join("; ")}`);
  console.log(`  step outputs to upload (${outputs.size}): ${[...outputs].map(([l, t]) => `${l} [${t}]`).join("; ")}`);
  console.log(`  other documents (${untyped.size}): ${[...untyped].join("; ")}`);
  console.log(`  values (${values.size}): ${[...values].join("; ")}`);
  console.log(`  confirmations: ${confirms} · steps with a channel choice: ${variantSteps}`);
}
console.log(`\nDocument types across all five (${union.size}): ${[...union].map(([t, ids]) => `${t} (${[...ids].join(",")})`).join("; ")}`);
