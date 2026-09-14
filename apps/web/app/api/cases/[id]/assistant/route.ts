import { HttpError, jsonBody, routeError } from "../../../../lib/http";
import { syncCaseBlockProgress } from "../../../../lib/legacy-progress";
import { assistantView } from "../../../../lib/steps/assistant";
import { loadCase } from "../../../../lib/steps/context";
import { completeStep, confirmDocument, recordInput, StepNotReady } from "../../../../lib/steps/service";

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

    let projection;
    switch (action) {
      case "value":
      case "confirm":
      case "variant": {
        const label = String(body.label ?? "").trim();
        const value = String(body.value ?? "").trim();
        if (!Number.isFinite(stepNum) || !label || !value) throw new HttpError(400, "stepNum, label and value are required");
        projection = await recordInput(c.repository, c.runId, { kind: action, stepNum, label, value });
        break;
      }
      case "confirm-document": {
        const docId = String(body.docId ?? "");
        if (!docId) throw new HttpError(400, "docId is required");
        const corrections =
          body.corrections && typeof body.corrections === "object" && !Array.isArray(body.corrections)
            ? (body.corrections as Record<string, string | null>)
            : {};
        projection = await confirmDocument(c.repository, c.runId, docId, corrections, body.confirmAll === true);
        break;
      }
      case "complete":
        if (!Number.isFinite(stepNum)) throw new HttpError(400, "stepNum is required");
        projection = await completeStep(c.repository, c.procedure, c.runId, stepNum);
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
