import { runOrchestrator } from "../../../../agents/orchestrator";
import { createD1WorkflowRepository } from "../../../../lib/d1-workflow-repository";
import { buildDagProjection } from "../../../../lib/dag-projection";
import { routeError } from "../../../../lib/http";
type Ctx = { params: Promise<{ id: string }> };
export async function POST(_request: Request, { params }: Ctx) { try { const repo = createD1WorkflowRepository(); return Response.json({ dag: buildDagProjection(await runOrchestrator(repo, (await params).id)) }); } catch (e) { return routeError(e); } }
