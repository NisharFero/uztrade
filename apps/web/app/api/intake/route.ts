import { getRuntimeEnv } from "@/modules/runtime/env";
const env = getRuntimeEnv();
import { CATALOGUE } from "../../../modules/procedures/data/procedures.generated";
import type { ShipmentFacts } from "../../../modules/workflow/domain";
import { openCaseFromIntake } from "../../../modules/cases/orchestration";
import { buildDagProjection } from "../../../modules/workflow/dag-projection";
import { evaluate } from "../../../modules/intake/conversation";
import { parseDraft, type Slot } from "../../../modules/intake/draft";
import { intakeTurn } from "../../../modules/intake/turn";
import { buildStepPlan } from "../../../modules/intake/plan";
import { llmFromEnv, type LlmEnv } from "../../../modules/ai/llm";
import { agenticAiFromEnv } from "../../../modules/workflow/agentic-ai";
import { portalsFromEnv, type PortalEnv } from "../../../modules/portals/client";

const SLOTS: Slot[] = ["commodity", "direction", "mode", "quantity", "route"];

/** One intake turn. `{message, draft, expecting}` answers the current question;
 *  `{draft, confirm: true}` re-validates the draft and, only if every detail
 *  still holds, opens the case and builds its steps. A message the rules can't
 *  read (another language, typos) is read by a model and restated for the rules. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: unknown; draft?: unknown; expecting?: unknown; confirm?: unknown };
    const draft = parseDraft(body.draft);

    if (body.confirm === true) {
      const turn = evaluate(draft);
      if (turn.status !== "confirm" || !turn.summary) return Response.json(turn);

      const summary = turn.summary;
      const facts: ShipmentFacts = {
        goods: turn.draft.commodity!.term,
        quantity: turn.draft.quantity!.value,
        unit: turn.draft.quantity!.unit,
        origin: turn.draft.origin!.name,
        destination: turn.draft.destination!.name,
        mode: turn.draft.mode,
      };
      const bindings = env as unknown as { GROQ_API_KEY?: string; GROQ_MODEL?: string; DOCAI_URL?: string };
      const opened = await openCaseFromIntake({ procedureId: summary.procedureId, query: summary.query, facts }, { ai: agenticAiFromEnv(bindings), portals: portalsFromEnv(env as unknown as PortalEnv) });
      return Response.json(
        {
          ...turn,
          status: "opened",
          caseId: opened.case.id,
          procedureId: summary.procedureId,
          title: opened.case.title,
          dag: buildDagProjection(opened.workflow),
          shipment: facts,
          planSummary: opened.workflow ? buildStepPlan(opened.procedure).summary : "",
        },
        { status: 201 },
      );
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return Response.json({ error: "message is required" }, { status: 400 });
    const expecting = SLOTS.find((s) => s === body.expecting) ?? null;

    return Response.json(await intakeTurn(draft, message, expecting, llmFromEnv(env as unknown as LlmEnv)));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
