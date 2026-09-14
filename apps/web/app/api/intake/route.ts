import { PROCEDURES } from "../../data/procedures.generated";
import type { ShipmentFacts } from "../../domain/workflow";
import { openCaseFromIntake } from "../../lib/case-orchestration-service";
import { buildDagProjection } from "../../lib/dag-projection";
import { converse, evaluate } from "../../lib/intake/conversation";
import { parseDraft, type Slot } from "../../lib/intake/draft";
import { buildStepPlan } from "../../lib/intake/plan";

const SLOTS: Slot[] = ["commodity", "mode", "quantity", "route"];

/** One intake turn. `{message, draft, expecting}` answers the current question;
 *  `{draft, confirm: true}` re-validates the draft and, only if every detail
 *  still holds, opens the case and builds its steps. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: unknown; draft?: unknown; expecting?: unknown; confirm?: unknown };
    const draft = parseDraft(body.draft);

    if (body.confirm === true) {
      const turn = evaluate(draft);
      if (turn.status !== "confirm" || !turn.summary) return Response.json(turn);

      // One case at a time: the open one has to be completed first.
      const { activeCase } = await import("../../lib/active-case");
      const open = await activeCase();
      if (open) {
        return Response.json(
          { ...turn, error: `Case ${open.id} (${open.title}) is still open — complete it before starting another.`, activeCaseId: open.id },
          { status: 409 },
        );
      }

      const summary = turn.summary;
      const facts: ShipmentFacts = {
        goods: turn.draft.commodity!.term,
        quantity: turn.draft.quantity!.value,
        unit: turn.draft.quantity!.unit,
        origin: turn.draft.origin!.name,
        destination: turn.draft.destination!.name,
        mode: turn.draft.mode,
      };
      const opened = await openCaseFromIntake({ procedureId: summary.procedureId, query: summary.query, facts });
      return Response.json(
        {
          ...turn,
          status: "opened",
          caseId: opened.case.id,
          procedureId: summary.procedureId,
          title: summary.title,
          dag: buildDagProjection(opened.workflow),
          shipment: facts,
          planSummary: buildStepPlan(PROCEDURES[summary.procedureId]).summary,
        },
        { status: 201 },
      );
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return Response.json({ error: "message is required" }, { status: 400 });
    const expecting = SLOTS.find((s) => s === body.expecting) ?? null;
    return Response.json(converse(draft, message, { expecting }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
