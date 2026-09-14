import { listOperationalRows } from "../../lib/backend-catalog";
import { routeError } from "../../lib/http";
export async function GET(request: Request) { try { return Response.json({ auditEvents: await listOperationalRows("audit_events", new URL(request.url).searchParams.get("runId") ?? undefined) }); } catch (e) { return routeError(e); } }
