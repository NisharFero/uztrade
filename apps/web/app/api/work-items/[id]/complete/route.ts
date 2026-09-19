import { getRuntimeEnv } from "@/modules/runtime/env";
const env = getRuntimeEnv();
import { jsonBody, requiredString, routeError } from "../../../../../modules/shared/http";
import { buildDagProjection } from "../../../../../modules/workflow/dag-projection";
import { agenticAiFromEnv } from "../../../../../modules/workflow/agentic-ai";
import { portalsFromEnv, type PortalEnv } from "../../../../../modules/portals/client";
import { completePersistedWorkflowWorkItem } from "../../../../../modules/workflow/service";
type Ctx = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Ctx) { try { const body = await jsonBody(request); const completedBy = requiredString(body, "completedBy"); const result = body.result && typeof body.result === "object" && !Array.isArray(body.result) ? body.result as Record<string, unknown> : { confirmed: true, mock: true }; const ai = agenticAiFromEnv(env as unknown as { GROQ_API_KEY?: string; GROQ_MODEL?: string; DOCAI_URL?: string }); const portals = portalsFromEnv(env as unknown as PortalEnv); return Response.json({ dag: buildDagProjection(await completePersistedWorkflowWorkItem((await params).id, result, completedBy, { ai, portals })) }); } catch (e) { return routeError(e); } }
