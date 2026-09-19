/* 868 step by step: who does it, and each need the step assistant will ask for. */
import { PROCEDURES } from "../../modules/procedures/sync";
import { instantiateWorkflow } from "../../modules/workflow/domain";
import { buildLedger } from "../../modules/steps/ledger";
import { stepViewFor } from "../../modules/steps/next";
import type { WorkflowProjection } from "../../modules/workflow/repository";

const procedure = PROCEDURES["868"];
const runId = "steps:868";
const workflow = instantiateWorkflow(procedure, runId);
const projection: WorkflowProjection = {
  run: { id: runId, caseId: "steps", procedureVersionId: "procedure:868:v1", status: "running", cycle: 0 },
  shipmentFacts: { goods: "", quantity: null, unit: null, origin: null, destination: null, mode: null },
  nodes: workflow.nodes, edges: workflow.edges, workItems: [], agentRuns: [], artifacts: [], auditEvents: [],
};
for (const node of workflow.nodes) {
  const v = stepViewFor(procedure, projection, buildLedger([]), node);
  const needs = [...v.needs, ...v.variants.flatMap((x) => x.needs.map((n) => ({ ...n, label: `${x.label} › ${n.label}` })))]
    .filter((n) => n.kind === "document" || n.kind === "value")
    .map((n) => `${n.kind === "value" ? "V" : n.output ? "OUT" : "D"}:${n.label}${n.docType ? `[${n.docType}]` : ""}${n.optional ? "(opt)" : ""}`);
  console.log(`${String(node.stepNum).padStart(2)} ${node.lane.padEnd(8)} ${node.optional ? "OPT " : ""}${v.title} · ${v.channel} → ${v.output}${v.variants.length ? " · variants: " + v.variants.map((x) => x.label).join(" | ") : ""}${needs.length ? "\n     " + needs.join("\n     ") : ""}`);
}
