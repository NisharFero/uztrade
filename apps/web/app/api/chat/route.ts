import { getRuntimeEnv } from "@/modules/runtime/env";
const env = getRuntimeEnv();
import { llmFromEnv, type LlmEnv } from "../../../modules/ai/llm";
import { runChat, type ChatEvent } from "../../../modules/assistant/chat";
import { parseDraft, type Slot } from "../../../modules/intake/draft";
import { HttpError, jsonBody, routeError } from "../../../modules/shared/http";

const SLOTS: Slot[] = ["commodity", "direction", "mode", "quantity", "route"];

/** One chat message, answered as a stream of newline-delimited JSON events:
 *  the stages the agent goes through (working out what is asked, then intake,
 *  the cases or the procedures), its reading of the message, and the result.
 *  Creating a case stays on POST /api/intake with confirm. */
export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 1000) : "";
    if (!message) throw new HttpError(400, "message is required");
    const draft = parseDraft(body.draft);
    const expecting = SLOTS.find((s) => s === body.expecting) ?? null;

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: ChatEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        await runChat({ message, draft, expecting }, {
          llm: llmFromEnv(env as unknown as LlmEnv),
          listCases: async () => (await import("../../../modules/cases/store")).listCases(),
          projection: async (runId) => (await import("../../../modules/workflow/d1-repository")).createD1WorkflowRepository().getProjection(runId),
        }, emit);
        controller.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
  } catch (error) {
    return routeError(error);
  }
}
