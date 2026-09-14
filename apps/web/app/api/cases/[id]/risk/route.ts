import type { ShipmentFacts } from "../../../../../modules/workflow/domain";
import { routeError } from "../../../../../modules/shared/http";
import { assessRisk } from "../../../../../modules/compliance/risk";
import { loadCase } from "../../../../../modules/steps/context";
import { buildLedger } from "../../../../../modules/steps/ledger";

type Ctx = { params: Promise<{ id: string }> };

/** Risk & Compliance for a live case: every row computed from intake facts,
 *  the route, the country list, workflow state and uploaded documents. */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const c = await loadCase(id);
    const projection = await c.repository.getProjection(c.runId);
    let facts: Partial<ShipmentFacts> = projection.shipmentFacts;
    try {
      facts = { ...JSON.parse(c.found.shipmentFacts || "{}"), ...projection.shipmentFacts };
    } catch {
      // keep the projection's facts
    }
    return Response.json(assessRisk({ procedure: c.procedure, facts, query: c.found.query, projection, ledger: buildLedger(projection.artifacts) }));
  } catch (error) {
    return routeError(error);
  }
}
