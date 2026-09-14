import { listOperationalRows } from "../../lib/backend-catalog";
import { routeError } from "../../lib/http";
export async function GET(request: Request) { try { const runId = new URL(request.url).searchParams.get("runId") ?? undefined; return Response.json({ workItems: await listOperationalRows("work_items", runId) }); } catch (e) { return routeError(e); } }
