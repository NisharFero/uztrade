import { listOperationalRows } from "../../lib/backend-catalog";
import { routeError } from "../../lib/http";
export async function GET(request: Request) { try { return Response.json({ agentRuns: await listOperationalRows("agent_runs", new URL(request.url).searchParams.get("runId") ?? undefined) }); } catch (e) { return routeError(e); } }
