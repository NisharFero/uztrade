import assert from "node:assert/strict";
import { PROCEDURE_IDS } from "../../modules/procedures/data/procedures.generated";
import { requireProcedure } from "../../modules/procedures/registry";
import { instantiateWorkflow, type ShipmentFacts } from "../../modules/workflow/domain";
import { createMemoryWorkflowRepository, type WorkflowProjection } from "../../modules/workflow/repository";
import { runOrchestrator } from "../../modules/workflow/orchestrator";
import { executeSpecialist } from "../../modules/workflow/specialists";
import { buildLedger } from "../../modules/steps/ledger";
import { stepViewFor } from "../../modules/steps/next";
import { assistantView } from "../../modules/steps/assistant";
import { assessRisk } from "../../modules/compliance/risk";
import { transitView } from "../../modules/transit/transit";
import { portalTargetOf } from "../../modules/portals/targets";
import type { CaseResult, Suite } from "../types";

export const agentsCorpusSuite: Suite = {
  name: "agents-corpus",
  about: "Every procedure: real orchestrator pauses with missing evidence, repeat requests preserve work, every step has needs and a specialist, and risk/transit/assistant views survive serialized state. External APIs are not called.",
  async run(options) {
    const results: CaseResult[] = [];
    for (const id of PROCEDURE_IDS.slice(0, options.limit ?? PROCEDURE_IDS.length)) {
      try {
        const procedure = await requireProcedure(id);
        const runId = `eval-agents-${id}`;
        const facts: ShipmentFacts = { goods: procedure.goods, quantity: 5, unit: "tonnes", origin: procedure.direction === "export" ? "Tashkent" : "Almaty", destination: procedure.direction === "transit" ? "Moscow" : procedure.direction === "import" ? "Tashkent" : "Almaty", mode: procedure.mode };
        const repository = createMemoryWorkflowRepository();
        await repository.createRun({ id: runId, caseId: runId, procedureVersionId: `procedure:${id}:v1`, status: "running", cycle: 0 }, instantiateWorkflow(procedure, runId), facts);
        const first = await runOrchestrator(repository, runId);
        const second = await runOrchestrator(repository, runId);
        assert.deepEqual(second.nodes.map((n) => [n.id, n.state, n.attempts]), first.nodes.map((n) => [n.id, n.state, n.attempts]), "A repeated request repeated work without new evidence");
        assert.equal(second.agentRuns.length, first.agentRuns.length);
        assert.equal(second.artifacts.length, first.artifacts.length);
        assert.equal(new Set(second.workItems.map((w) => w.nodeId)).size, second.workItems.length);
        const projection = JSON.parse(JSON.stringify(second)) as WorkflowProjection;
        const ledger = buildLedger(projection.artifacts);
        for (const node of projection.nodes) {
          const view = stepViewFor(procedure, projection, ledger, node);
          assert.equal(view.stepNum, node.stepNum);
          if (node.state === "needs_input" && node.lane === "agent") assert.equal(view.ready, false, "A ready agent was left paused");
          const specialist = await executeSpecialist(node, facts, { procedure, completedSteps: new Set() });
          assert.ok(specialist.agent && specialist.artifactType && specialist.name);
          assert.equal(specialist.simulated, true, "Local evaluation must not claim real entity execution");
          if (node.lane === "agent" && /^online/i.test(node.channel)) {
            const step = procedure.blocks.flatMap((b) => b.steps).find((s) => s.num === node.stepNum)!;
            assert.ok(portalTargetOf(step), `No entity mapping for step ${node.stepNum}`);
          }
        }
        const view = assistantView(procedure, projection, runId);
        assert.equal(view.kpis.total, procedure.stepsCount);
        assert.ok(view.next || projection.run.status === "completed", "No actionable next step and run is not complete");
        assert.ok(assessRisk({ procedure, facts, projection, ledger }).rows.length);
        assert.ok(transitView({ caseId: runId, procedure, facts, projection, ledger }).status.milestone);
        results.push({ id: `${id}: agents, ${projection.nodes.length} steps, resume`, ok: true });
      } catch (error) { results.push({ id: `${id}: agents`, ok: false, detail: (error as Error).message.slice(0, 250) }); }
    }
    return results;
  },
};
