import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { caseBlocks, cases } from "../../db/schema";
import { deriveBlockProgress } from "../workflow/dag-projection";
import type { WorkflowProjection } from "../workflow/repository";

export async function syncCaseBlockProgress(projection: WorkflowProjection) {
  const db = getDb();
  const progress = deriveBlockProgress(projection.nodes);
  const now = new Date().toISOString();
  for (const [blockId, state] of Object.entries(progress)) {
    await db.update(caseBlocks).set({
      state,
      startedAt: state === "running" ? now : undefined,
      completedAt: state === "done" ? now : null,
    }).where(and(eq(caseBlocks.caseId, projection.run.caseId), eq(caseBlocks.blockId, blockId)));
  }
  const complete = Object.values(progress).every((state) => state === "done");
  await db.update(cases).set({ status: complete ? "complete" : "active", updatedAt: now }).where(eq(cases.id, projection.run.caseId));
}
