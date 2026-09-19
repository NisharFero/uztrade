import { getRuntimeEnv } from "@/modules/runtime/env";
const env = getRuntimeEnv();
import { llmFromEnv, type LlmEnv } from "../../../../modules/ai/llm";
import { answerQuestion } from "../../../../modules/faq/answer";
import { HttpError, jsonBody, routeError } from "../../../../modules/shared/http";

/** A question answered only from the published procedures, with its sources. */
export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const question = typeof body.question === "string" ? body.question.trim().slice(0, 500) : "";
    if (!question) throw new HttpError(400, "question is required");
    return Response.json(await answerQuestion(question, llmFromEnv(env as unknown as LlmEnv)));
  } catch (error) {
    return routeError(error);
  }
}
