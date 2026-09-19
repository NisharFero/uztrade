import type { ShipmentFacts } from "../../../../../modules/workflow/domain";
import { routeError } from "../../../../../modules/shared/http";
import { loadCase } from "../../../../../modules/steps/context";
import { buildLedger } from "../../../../../modules/steps/ledger";
import { transitView } from "../../../../../modules/transit/transit";
import { latestTransitState } from "../../../../../modules/transit/agent";

type Ctx = { params: Promise<{ id: string }> };

/** Transit & Capacity for a live case: what has to move, the capacity and
 *  equipment it takes, where the shipment stands, the transport references it
 *  carries, and what is holding the movement up. */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const c = await loadCase(id);
    const projection = await c.repository.getProjection(c.runId);
    let facts: ShipmentFacts = projection.shipmentFacts;
    try {
      facts = { ...facts, ...(JSON.parse(c.found.shipmentFacts || "{}") as Partial<ShipmentFacts>) };
    } catch {
      // keep the projection's facts
    }
    const view = transitView({
      caseId: id,
      procedure: c.procedure,
      facts,
      query: c.found.query,
      projection,
      ledger: buildLedger(projection.artifacts),
    });
    return Response.json({ ...view, recorded: latestTransitState(projection) });
  } catch (error) {
    return routeError(error);
  }
}
