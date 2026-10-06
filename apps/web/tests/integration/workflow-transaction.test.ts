import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { cases, workflowEdges, workflowNodes, workflowRuns } from "../../db/schema";
import { instantiateWorkflow, type ShipmentFacts } from "../../modules/workflow/domain";
import { createD1WorkflowRepository } from "../../modules/workflow/d1-repository";
import { PROCEDURES } from "../../modules/procedures/sync";

test("a failed workflow insert rolls back its run and nodes", async () => {
  const db = getDb();
  const id = `test-${crypto.randomUUID()}`;
  const runId = `workflow:${id}`;
  const facts: ShipmentFacts = { goods: "tea", quantity: 1, unit: "tonne", origin: "Tashkent", destination: "Almaty", mode: "train" };
  const workflow = instantiateWorkflow(PROCEDURES["868"], runId);
  await db.insert(cases).values({ id, procedureId: "868", title: "Transaction test", goods: "tea", query: "test", matchedBy: "test" });
  try {
    await assert.rejects(() => createD1WorkflowRepository().createRun(
      { id: runId, caseId: id, procedureVersionId: "procedure:868:v1", status: "running", cycle: 0 },
      { ...workflow, nodes: [workflow.nodes[0], workflow.nodes[0]] },
      facts,
    ));
    assert.equal((await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId))).length, 0);
    assert.equal((await db.select().from(workflowNodes).where(eq(workflowNodes.runId, runId))).length, 0);
    assert.equal((await db.select().from(workflowEdges).where(eq(workflowEdges.runId, runId))).length, 0);
    const [caseRow] = await db.select().from(cases).where(eq(cases.id, id));
    assert.equal(caseRow.workflowRunId, null);

    await createD1WorkflowRepository().createRun(
      { id: runId, caseId: id, procedureVersionId: "procedure:868:v1", status: "running", cycle: 0 },
      workflow,
      facts,
    );
    const opened = await createD1WorkflowRepository().getProjection(runId);
    assert.equal(opened.nodes.length, workflow.nodes.length);
    assert.equal(opened.edges.length, workflow.edges.length);
    const [linked] = await db.select().from(cases).where(eq(cases.id, id));
    assert.equal(linked.workflowRunId, runId);
  } finally {
    await db.delete(workflowEdges).where(eq(workflowEdges.runId, runId));
    await db.delete(workflowNodes).where(eq(workflowNodes.runId, runId));
    await db.delete(workflowRuns).where(eq(workflowRuns.id, runId));
    await db.delete(cases).where(eq(cases.id, id));
  }
});
