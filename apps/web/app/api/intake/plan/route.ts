import { getRuntimeEnv } from "@/modules/runtime/env";
const env = getRuntimeEnv();
import { llmFromEnv, type LlmEnv } from "../../../../modules/ai/llm";
import { parseDraft, type Slot } from "../../../../modules/intake/draft";
import { previewIntake, shipmentSentence } from "../../../../modules/intake/preview";
import { rememberOrigin } from "../../../../modules/procedures/registry";
import { HttpError, jsonBody, routeError } from "../../../../modules/shared/http";

/* A model may read a message the rules cannot (typos, another language). */
export const maxDuration = 60;

const SLOTS: Slot[] = ["commodity", "direction", "mode", "regime", "quantity", "route"];

/** The intake block's match: fields or a line of text in, the matched
 *  procedure, its timing and what it needs out. Never opens a case - that is
 *  POST /api/intake with `confirm`. */
export async function POST(request: Request) {
  try {
    rememberOrigin(request.url);
    const body = await jsonBody(request);
    const fields = body.fields && typeof body.fields === "object" ? (body.fields as Record<string, unknown>) : null;
    const message = (typeof body.message === "string" ? body.message : fields ? shipmentSentence(fields) : "").trim().slice(0, 500);
    if (!message) throw new HttpError(400, "Say what you are moving, or fill in the goods");
    const expecting = SLOTS.find((s) => s === body.expecting) ?? null;
    return Response.json(
      await previewIntake({
        message,
        draft: body.draft ? parseDraft(body.draft) : null,
        expecting,
        llm: llmFromEnv(env as unknown as LlmEnv),
      }),
    );
  } catch (error) {
    return routeError(error);
  }
}
