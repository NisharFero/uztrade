import { listOperationalRows } from "../../../modules/catalog/catalog";
import { routeError } from "../../../modules/shared/http";
export async function GET(request: Request) { try { return Response.json({ artifacts: await listOperationalRows("artifacts", new URL(request.url).searchParams.get("runId") ?? undefined) }); } catch (e) { return routeError(e); } }
