import { runOrchestrator } from "../../../../../modules/workflow/orchestrator";
import { createD1WorkflowRepository } from "../../../../../modules/workflow/d1-repository";
import { buildDagProjection } from "../../../../../modules/workflow/dag-projection";
import { routeError } from "../../../../../modules/shared/http";
type Ctx = { params: Promise<{ id: string }> };
export async function POST(_request: Request, { params }: Ctx) { try { const repo = createD1WorkflowRepository(); return Response.json({ dag: buildDagProjection(await runOrchestrator(repo, (await params).id)) }); } catch (e) { return routeError(e); } }
