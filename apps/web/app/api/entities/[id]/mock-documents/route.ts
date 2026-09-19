import { getRuntimeEnv } from "@/modules/runtime/env";
const env = getRuntimeEnv();
import { issuePersistedEntityMockDocument } from "../../../../../modules/entities/mock-api";
import { jsonBody, requiredString, routeError } from "../../../../../modules/shared/http";
import { agenticAiFromEnv } from "../../../../../modules/workflow/agentic-ai";
import { portalsFromEnv, type PortalEnv } from "../../../../../modules/portals/client";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const ai = agenticAiFromEnv(env as unknown as { GROQ_API_KEY?: string; GROQ_MODEL?: string; DOCAI_URL?: string });
    const portals = portalsFromEnv(env as unknown as PortalEnv);
    const body = await jsonBody(request);
    const stepNum = Number(body.stepNum);
    if (!Number.isInteger(stepNum) || stepNum < 0) throw new Error("stepNum must be a non-negative integer");
    return Response.json(await issuePersistedEntityMockDocument((await params).id, { ...body, stepNum, label: requiredString(body, "label") }, { ai, portals }), { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
