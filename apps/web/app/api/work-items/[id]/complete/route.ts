import { jsonBody, requiredString, routeError } from "../../../../lib/http";
import { buildDagProjection } from "../../../../lib/dag-projection";
import { completePersistedWorkflowWorkItem } from "../../../../lib/workflow-service";
type Ctx = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Ctx) { try { const body = await jsonBody(request); const completedBy = requiredString(body, "completedBy"); const result = body.result && typeof body.result === "object" && !Array.isArray(body.result) ? body.result as Record<string, unknown> : { confirmed: true, mock: true }; return Response.json({ dag: buildDagProjection(await completePersistedWorkflowWorkItem((await params).id, result, completedBy)) }); } catch (e) { return routeError(e); } }
