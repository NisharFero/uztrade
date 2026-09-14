/* One user, one case at a time. The dashboard chat always shows the active
 * case's current step; a new case can only be opened once it is complete. */

import { desc, eq, ne } from "drizzle-orm";
import { getDb } from "../../db";
import { ensureSchema } from "../../db/migrate";
import { agentRuns, artifacts, auditEvents, caseBlocks, cases, workItems, workflowEdges, workflowNodes, workflowRuns } from "../../db/schema";

export type CaseSummary = { id: string; procedureId: string; title: string; status: string; query: string };

async function db() {
  await ensureSchema();
  return getDb();
}

const summary = (row: typeof cases.$inferSelect): CaseSummary => ({
  id: row.id,
  procedureId: row.procedureId,
  title: row.title,
  status: row.status,
  query: row.query,
});

/** The case still in progress, if any. */
export async function activeCase(): Promise<CaseSummary | null> {
  const d = await db();
  const [row] = await d.select().from(cases).where(ne(cases.status, "complete")).orderBy(desc(cases.createdAt), desc(cases.id)).limit(1);
  return row ? summary(row) : null;
}

/** The most recent case for a procedure - active or complete - whose workflow the procedure page shows. */
export async function latestCaseFor(procedureId: string): Promise<CaseSummary | null> {
  const d = await db();
  const [row] = await d.select().from(cases).where(eq(cases.procedureId, procedureId)).orderBy(desc(cases.createdAt), desc(cases.id)).limit(1);
  return row ? summary(row) : null;
}

type Bucket = {
  list(options: { prefix: string; cursor?: string }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
  delete(keys: string[]): Promise<void>;
};

/** Deletes every case and everything hanging off it: workflow runs, nodes,
 *  work items, agent runs, the ledger (artifacts), audit events and uploaded
 *  originals. Users, entities and procedure definitions are kept. */
export async function resetAllCases(bucket?: Bucket): Promise<{ cases: number; objects: number }> {
  const d = await db();
  const existing = await d.select({ id: cases.id }).from(cases);
  for (const table of [auditEvents, artifacts, agentRuns, workItems, workflowEdges, workflowNodes, workflowRuns, caseBlocks, cases]) {
    await d.delete(table);
  }

  let objects = 0;
  if (bucket) {
    let cursor: string | undefined;
    do {
      const page = await bucket.list({ prefix: "cases/", cursor });
      const keys = page.objects.map((o) => o.key);
      if (keys.length) await bucket.delete(keys);
      objects += keys.length;
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
  return { cases: existing.length, objects };
}
