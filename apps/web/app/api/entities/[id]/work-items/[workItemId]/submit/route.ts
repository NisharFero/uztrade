import { getRuntimeEnv } from "@/modules/runtime/env";
const env = getRuntimeEnv();
import { jsonBody, routeError } from "../../../../../../../modules/shared/http";
import { submitPersistedEntityWorkItem } from "../../../../../../../modules/entities/mock-api";
import { agenticAiFromEnv } from "../../../../../../../modules/workflow/agentic-ai";
import { portalsFromEnv, type PortalEnv } from "../../../../../../../modules/portals/client";

type Ctx = { params: Promise<{ id: string; workItemId: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id, workItemId } = await params;
    const ai = agenticAiFromEnv(env as unknown as { GROQ_API_KEY?: string; GROQ_MODEL?: string; DOCAI_URL?: string });
    const portals = portalsFromEnv(env as unknown as PortalEnv);
    return Response.json(await submitPersistedEntityWorkItem(id, workItemId, await jsonBody(request), { ai, portals }));
  } catch (error) {
    return routeError(error);
  }
}
