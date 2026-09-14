import { env } from "cloudflare:workers";
import { listCases } from "../../../modules/cases/store";
import { openCaseFromQuery } from "../../../modules/cases/orchestration";
import { jsonBody, requiredString, routeError } from "../../../modules/shared/http";
import { buildDagProjection } from "../../../modules/workflow/dag-projection";
export async function GET() { try { return Response.json({ cases: await listCases() }); } catch (e) { return routeError(e); } }
export async function POST(request: Request) { try { const body = await jsonBody(request); const query = requiredString(body, "query"); const apiKey = (env as unknown as { GROQ_API_KEY?: string }).GROQ_API_KEY; const result = await openCaseFromQuery(query, apiKey); if (!result.matched) return Response.json({ matched: false, reason: result.match.reason, supported: result.supported }); return Response.json({ matched: true, case: result.case, dag: buildDagProjection(result.workflow), reason: result.match.reason, confidence: result.match.confidence, matchedBy: result.match.matchedBy }, { status: 201 }); } catch (e) { return routeError(e); } }
