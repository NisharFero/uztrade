import { createD1WorkflowRepository } from "../../../../modules/workflow/d1-repository";
import { buildDagProjection } from "../../../../modules/workflow/dag-projection";
import { routeError } from "../../../../modules/shared/http";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Ctx) { try { return Response.json({ dag: buildDagProjection(await createD1WorkflowRepository().getProjection((await params).id)) }); } catch (e) { return routeError(e); } }
