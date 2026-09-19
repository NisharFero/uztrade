import { getRuntimeEnv } from "@/modules/runtime/env";
const env = getRuntimeEnv();
import { llmFromEnv, type LlmEnv } from "../../../../../../modules/ai/llm";
import { assistantView } from "../../../../../../modules/steps/assistant";
import { loadCase } from "../../../../../../modules/steps/context";
import { answerRoutedProcedureQuestion, type ProcedureQaAnswer } from "../../../../../../modules/steps/procedure-qa";
import { HttpError, jsonBody, routeError } from "../../../../../../modules/shared/http";

type Ctx = { params: Promise<{ id: string }> };

function render(answer: ProcedureQaAnswer): string {
  const bullets = answer.bullets.length ? `\n${answer.bullets.map((b) => `- ${b}`).join("\n")}` : "";
  const confirm = answer.confirmation ? `\nConfirm: ${answer.confirmation.label}` : "";
  return `${answer.title}\n${answer.message}${bullets}${confirm}`;
}

function streamText(text: string) {
  const encoder = new TextEncoder();
  const words = text.split(/(\s+)/).filter(Boolean);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const word of words) controller.enqueue(encoder.encode(word));
      controller.close();
    },
  });
}

/** Streams the case-aware or FAQ-routed procedure answer. Clarifications stream
 * as plain text too, so the UI handles one response mode. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await jsonBody(request);
    const question = String(body.question ?? "").trim();
    if (!question) throw new HttpError(400, "question is required");
    const c = await loadCase(id);
    const projection = await c.repository.getProjection(c.runId);
    const view = assistantView(c.procedure, projection, id);
    const answer = await answerRoutedProcedureQuestion({ question, procedure: c.procedure, projection, view, llm: llmFromEnv(env as unknown as LlmEnv) });
    return new Response(streamText(render(answer)), {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-answer-kind": answer.kind,
        "x-answer-title": encodeURIComponent(answer.title),
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
