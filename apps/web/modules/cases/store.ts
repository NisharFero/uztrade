import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { ensureSchema } from "../../db/migrate";
import { caseBlocks, cases, type CaseBlockRow, type CaseRow } from "../../db/schema";
import { PROCEDURES } from "../procedures/data/procedures.generated";
import { checklistFor, markOutput, parseDocumentState, type BlockChecklist, type DocumentState } from "../documents/checklist";

export type BlockState = "waiting" | "blocked" | "running" | "done";

export type CaseWithBlocks = CaseRow & { blocks: CaseBlockRow[]; documentState: string };

/** Returned by completeBlock when the Document Intelligence agent finds a
 *  required output still outstanding - the "ask for amendments" moment. */
export type NeedsAmendment = { ok: false; checklist: BlockChecklist };
export type Completed = { ok: true; case: CaseWithBlocks };

async function db() {
  await ensureSchema();
  return getDb();
}

/** UZ-YYMM-NNNN, sequential within the month. */
async function nextReference(d: Awaited<ReturnType<typeof db>>): Promise<string> {
  const now = new Date();
  const prefix = `UZ-${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const rows = await d.select({ id: cases.id }).from(cases);
  const seq =
    rows.filter((r) => r.id.startsWith(prefix)).reduce((max, r) => {
      const n = Number(r.id.slice(prefix.length + 1));
      return Number.isFinite(n) && n > max ? n : max;
    }, 0) + 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

export async function listCases(): Promise<CaseWithBlocks[]> {
  const d = await db();
  const rows = await d.select().from(cases).orderBy(desc(cases.createdAt), desc(cases.id));
  if (!rows.length) return [];

  const blocks = await d.select().from(caseBlocks);
  const byCase = new Map<string, CaseBlockRow[]>();
  for (const b of blocks) byCase.set(b.caseId, [...(byCase.get(b.caseId) ?? []), b]);

  return rows.map((c) => ({ ...c, blocks: byCase.get(c.id) ?? [] }));
}

export async function getCase(id: string): Promise<CaseWithBlocks | null> {
  const d = await db();
  const [row] = await d.select().from(cases).where(eq(cases.id, id)).limit(1);
  if (!row) return null;
  const blocks = await d.select().from(caseBlocks).where(eq(caseBlocks.caseId, id));
  return { ...row, blocks };
}

/** Opens a case and seeds one row per block of the matched procedure, with the
 *  dependency-free blocks already runnable. */
export async function createCase(input: {
  procedureId: string;
  query: string;
  matchedBy: string;
}): Promise<CaseWithBlocks> {
  const procedure = PROCEDURES[input.procedureId];
  if (!procedure) throw new Error(`Unknown procedure ${input.procedureId}`);

  const d = await db();
  const id = await nextReference(d);
  const now = new Date().toISOString();

  await d.insert(cases).values({
    id,
    procedureId: procedure.id,
    title: procedure.title,
    goods: procedure.goods,
    query: input.query,
    matchedBy: input.matchedBy,
    status: "active",
    documentState: "{}",
    createdAt: now,
    updatedAt: now,
  });

  await d.insert(caseBlocks).values(
    procedure.blocks.map((b) => ({
      caseId: id,
      blockId: b.id,
      // Roots start runnable; everything else waits on its dependencies.
      state: (b.dependsOn.length === 0 ? "running" : "waiting") satisfies BlockState,
      startedAt: b.dependsOn.length === 0 ? now : null,
    })),
  );

  return (await getCase(id))!;
}

/** Toggles one required output as supplied (or notes why it doesn't apply) -
 *  the trader resolving a Document Intelligence amendment request. Does not
 *  itself advance the block; call completeBlock afterwards. */
export async function setOutputProvided(
  caseId: string,
  blockId: string,
  stepNum: number,
  provided: boolean,
  note?: string,
): Promise<CaseWithBlocks | null> {
  const existing = await getCase(caseId);
  if (!existing) return null;

  const state = markOutput(parseDocumentState(existing.documentState), blockId, stepNum, provided, note);
  const d = await db();
  await d
    .update(cases)
    .set({ documentState: JSON.stringify(state), updatedAt: new Date().toISOString() })
    .where(eq(cases.id, caseId));

  return getCase(caseId);
}

/** Marks a block done and unlocks any dependant whose dependencies are now all
 *  satisfied - the same readiness rule the diagram renders. Refuses to
 *  complete a block with an outstanding required output; the Document
 *  Intelligence agent's completeness gate runs before any state changes. */
export async function completeBlock(caseId: string, blockId: string): Promise<NeedsAmendment | Completed | null> {
  const existing = await getCase(caseId);
  if (!existing) return null;

  const procedure = PROCEDURES[existing.procedureId];
  if (!procedure) return { ok: true, case: existing };

  const block = procedure.blocks.find((b) => b.id === blockId);
  if (!block) return { ok: true, case: existing };

  const checklist = checklistFor(block, parseDocumentState(existing.documentState));
  if (!checklist.complete) return { ok: false, checklist };

  const d = await db();
  const now = new Date().toISOString();
  const row = existing.blocks.find((b) => b.blockId === blockId);

  const startedAt = row?.startedAt ?? now;
  const actualHours = (Date.parse(now) - Date.parse(startedAt)) / 3_600_000;

  await d
    .update(caseBlocks)
    .set({ state: "done", completedAt: now, startedAt, actualHours })
    .where(and(eq(caseBlocks.caseId, caseId), eq(caseBlocks.blockId, blockId)));

  const done = new Set([...existing.blocks.filter((b) => b.state === "done").map((b) => b.blockId), blockId]);

  for (const b of procedure.blocks) {
    if (done.has(b.id)) continue;
    if (!b.dependsOn.every((dep) => done.has(dep))) continue;
    const current = existing.blocks.find((x) => x.blockId === b.id);
    if (current?.state === "waiting") {
      await d
        .update(caseBlocks)
        .set({ state: "running", startedAt: now })
        .where(and(eq(caseBlocks.caseId, caseId), eq(caseBlocks.blockId, b.id)));
    }
  }

  const allDone = procedure.blocks.every((b) => done.has(b.id));
  await d
    .update(cases)
    .set({ status: allDone ? "complete" : "active", updatedAt: now })
    .where(eq(cases.id, caseId));

  return { ok: true, case: (await getCase(caseId))! };
}

export type { DocumentState };
