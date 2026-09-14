import { listOperationalRows } from "../../lib/backend-catalog";
import { routeError } from "../../lib/http";
export async function GET(request: Request) { try { return Response.json({ artifacts: await listOperationalRows("artifacts", new URL(request.url).searchParams.get("runId") ?? undefined) }); } catch (e) { return routeError(e); } }
