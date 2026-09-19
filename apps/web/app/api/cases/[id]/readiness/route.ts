import { getRuntimeEnv } from "@/modules/runtime/env";
const env = getRuntimeEnv();
import { routeError } from "../../../../../modules/shared/http";
import { caseReadiness } from "../../../../../modules/portals/readiness";
import { portalsFromEnv, type PortalEnv } from "../../../../../modules/portals/client";
import { loadCase } from "../../../../../modules/steps/context";

type Ctx = { params: Promise<{ id: string }> };

/** What the entities will ask for at the steps still ahead, checked against
 *  their own form rules without filing anything. */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const portals = portalsFromEnv(env as unknown as PortalEnv);
    if (!portals) return Response.json({ steps: [], needs: [], checked: 0, unavailable: true });
    const c = await loadCase(id);
    return Response.json(await caseReadiness(c.procedure, await c.repository.getProjection(c.runId), portals));
  } catch (error) {
    return routeError(error);
  }
}
