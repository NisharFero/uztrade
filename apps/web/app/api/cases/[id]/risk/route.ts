import type { ShipmentFacts } from "../../../../domain/workflow";
import { routeError } from "../../../../lib/http";
import { assessRisk } from "../../../../lib/risk";
import { loadCase } from "../../../../lib/steps/context";
import { buildLedger } from "../../../../lib/steps/ledger";

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
