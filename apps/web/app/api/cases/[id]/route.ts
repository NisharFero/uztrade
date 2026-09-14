import { completeBlock, getCase, setOutputProvided } from "../../../lib/case-store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const found = await getCase(id);
    if (!found) return Response.json({ error: "case not found" }, { status: 404 });
    return Response.json({ case: found });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 },
    );
  }
}

type Body =
  | { action?: "complete"; blockId?: string }
  | { action: "provide-output"; blockId?: string; stepNum?: number; provided?: boolean; note?: string };

/** Two actions, disambiguated by `action` (default "complete" so the earlier
 *  `{ blockId }` shape still works):
 *
 *  - complete: advance a block to done. The Document Intelligence agent's
 *    completeness gate runs first; a block with a missing required output is
 *    refused with 409 and the checklist, rather than silently completing.
 *  - provide-output: the trader resolving one amendment request. */
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const payload = (await request.json()) as Body;

    if (payload.action === "provide-output") {
      const blockId = payload.blockId?.trim() ?? "";
      if (!blockId || typeof payload.stepNum !== "number") {
        return Response.json({ error: "blockId and stepNum are required" }, { status: 400 });
      }
      const updated = await setOutputProvided(id, blockId, payload.stepNum, payload.provided ?? true, payload.note);
      if (!updated) return Response.json({ error: "case not found" }, { status: 404 });
      return Response.json({ case: updated });
    }

    const blockId = payload.blockId?.trim() ?? "";
    if (!blockId) return Response.json({ error: "blockId is required" }, { status: 400 });

    const result = await completeBlock(id, blockId);
    if (!result) return Response.json({ error: "case not found" }, { status: 404 });
    if (!result.ok) {
      // The agent found something missing rather than the request being wrong.
      return Response.json({ needsAmendment: true, checklist: result.checklist }, { status: 409 });
    }
    return Response.json({ case: result.case });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 },
    );
  }
}
