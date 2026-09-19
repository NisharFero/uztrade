import { getRuntimeEnv } from "@/modules/runtime/env";
const env = getRuntimeEnv();
import { listCases } from "../../../modules/cases/store";
import { openCaseFromQuery } from "../../../modules/cases/orchestration";
import { jsonBody, requiredString, routeError } from "../../../modules/shared/http";
import { buildDagProjection } from "../../../modules/workflow/dag-projection";
import { agenticAiFromEnv } from "../../../modules/workflow/agentic-ai";
import { portalsFromEnv, type PortalEnv } from "../../../modules/portals/client";
export async function GET() { try { return Response.json({ cases: await listCases() }); } catch (e) { return routeError(e); } }
export async function POST(request: Request) { try { const body = await jsonBody(request); const query = requiredString(body, "query"); const bindings = env as unknown as { GROQ_API_KEY?: string; GROQ_MODEL?: string; DOCAI_URL?: string }; const result = await openCaseFromQuery(query, bindings.GROQ_API_KEY, { ai: agenticAiFromEnv(bindings), portals: portalsFromEnv(env as unknown as PortalEnv) }); if (!result.matched) return Response.json({ matched: false, reason: result.match.reason, supported: result.supported }); return Response.json({ matched: true, case: result.case, dag: buildDagProjection(result.workflow), reason: result.match.reason, confidence: result.match.confidence, matchedBy: result.match.matchedBy }, { status: 201 }); } catch (e) { return routeError(e); } }
