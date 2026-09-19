import { getRuntimeEnv } from "@/modules/runtime/env";
const env = getRuntimeEnv();
import { HttpError, jsonBody, routeError } from "../../../../../modules/shared/http";
import { syncCaseBlockProgress } from "../../../../../modules/cases/block-progress";
import { assistantView } from "../../../../../modules/steps/assistant";
import { loadCase } from "../../../../../modules/steps/context";
import { answerRoutedProcedureQuestion } from "../../../../../modules/steps/procedure-qa";
import { completeStep, confirmDocument, recordInput, StepNotReady, syncCase } from "../../../../../modules/steps/service";
import { llmFromEnv, type LlmEnv } from "../../../../../modules/ai/llm";
import { agenticAiFromEnv } from "../../../../../modules/workflow/agentic-ai";
import { portalsFromEnv, type PortalEnv } from "../../../../../modules/portals/client";

type Ctx = { params: Promise<{ id: string }> };

/** The step assistant: KPIs, the next step and what it needs. */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const c = await loadCase(id);
    return Response.json(assistantView(c.procedure, await c.repository.getProjection(c.runId), id));
  } catch (error) {
    return routeError(error);
  }
}

/** One trader action: give a value, confirm, choose a channel, confirm a
 *  parsed document, or complete a step. Returns the refreshed view. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const c = await loadCase(id);
    const body = await jsonBody(request);
    const action = String(body.action ?? "");
    const stepNum = Number(body.stepNum);
    const ai = agenticAiFromEnv(env as unknown as { GROQ_API_KEY?: string; GROQ_MODEL?: string; DOCAI_URL?: string });
    const portals = portalsFromEnv(env as unknown as PortalEnv);

    let projection;
    switch (action) {
      case "ask": {
        const question = String(body.question ?? "").trim();
        if (!question) throw new HttpError(400, "question is required");
        projection = await c.repository.getProjection(c.runId);
        const view = assistantView(c.procedure, projection, id);
        return Response.json({ ...view, answer: await answerRoutedProcedureQuestion({ question, procedure: c.procedure, projection, view, llm: llmFromEnv(env as unknown as LlmEnv) }) });
      }
      case "value":
      case "confirm":
      case "variant": {
        const label = String(body.label ?? "").trim();
        const value = String(body.value ?? "").trim();
        if (!Number.isFinite(stepNum) || !label || !value) throw new HttpError(400, "stepNum, label and value are required");
        projection = await recordInput(c.repository, c.runId, { kind: action, stepNum, label, value }, { ai, portals });
        break;
      }
      case "confirm-document": {
        const docId = String(body.docId ?? "");
        if (!docId) throw new HttpError(400, "docId is required");
        const corrections =
          body.corrections && typeof body.corrections === "object" && !Array.isArray(body.corrections)
            ? (body.corrections as Record<string, string | null>)
            : {};
        projection = await confirmDocument(c.repository, c.runId, docId, corrections, body.confirmAll === true, { ai, portals });
        break;
      }
      case "sync":
        // Reads back applications under review at the entity APIs.
        projection = await syncCase(c.repository, c.runId, { ai, portals });
        break;
      case "complete":
        if (!Number.isFinite(stepNum)) throw new HttpError(400, "stepNum is required");
        projection = await completeStep(c.repository, c.procedure, c.runId, stepNum, "usr-trader", { ai, portals });
        break;
      default:
        throw new HttpError(400, `Unknown action “${action}”`);
    }

    await syncCaseBlockProgress(projection);
    return Response.json(assistantView(c.procedure, projection, id));
  } catch (error) {
    if (error instanceof StepNotReady) return Response.json({ error: error.message, missing: error.missing }, { status: 422 });
    return routeError(error);
  }
}
