import { listOperationalRows } from "../../../modules/catalog/catalog";
import { routeError } from "../../../modules/shared/http";
export async function GET(request: Request) { try { const runId = new URL(request.url).searchParams.get("runId") ?? undefined; return Response.json({ workItems: await listOperationalRows("work_items", runId) }); } catch (e) { return routeError(e); } }
