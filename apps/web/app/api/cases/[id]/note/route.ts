import { getRuntimeEnv } from "@/modules/runtime/env";
const env = getRuntimeEnv();
import { llmFromEnv, type LlmEnv } from "../../../../../modules/ai/llm";
import { HttpError, jsonBody, routeError } from "../../../../../modules/shared/http";
import { loadCase } from "../../../../../modules/steps/context";
import { buildLedger } from "../../../../../modules/steps/ledger";
import { openNodes, stepViewFor } from "../../../../../modules/steps/next";
import { readNote } from "../../../../../modules/steps/note";

type Ctx = { params: Promise<{ id: string }> };

/** Reads a line from the trader into what the open steps are waiting for.
 *  Nothing is recorded: the proposals come back for the trader to apply. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await jsonBody(request);
    const note = typeof body.text === "string" ? body.text.trim().slice(0, 1000) : "";
    if (!note) throw new HttpError(400, "text is required");

    const c = await loadCase(id);
    const projection = await c.repository.getProjection(c.runId);
    const ledger = buildLedger(projection.artifacts);
    const open = openNodes(projection)
      .slice(0, 4)
      .map((node) => {
        const view = stepViewFor(c.procedure, projection, ledger, node);
        return { stepNum: view.stepNum, title: view.title, needs: [...view.needs, ...view.variants.filter((v) => v.chosen).flatMap((v) => v.needs)] };
      });

    return Response.json(await readNote(note, open, llmFromEnv(env as unknown as LlmEnv)));
  } catch (error) {
    return routeError(error);
  }
}
