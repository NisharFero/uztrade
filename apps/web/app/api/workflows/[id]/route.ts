import { createD1WorkflowRepository } from "../../../lib/d1-workflow-repository";
import { buildDagProjection } from "../../../lib/dag-projection";
import { routeError } from "../../../lib/http";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Ctx) { try { return Response.json({ dag: buildDagProjection(await createD1WorkflowRepository().getProjection((await params).id)) }); } catch (e) { return routeError(e); } }
