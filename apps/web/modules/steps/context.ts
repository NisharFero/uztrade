/* Loads a case for the step APIs and builds what cross-checks compare against. */

import type { Procedure } from "../procedures/data/procedures.generated";
import { getProcedure } from "../procedures/registry";
import { tailorProcedure } from "../workflow/tailor";
import type { ShipmentFacts } from "../workflow/domain";
import type { CheckContext } from "../documents/docai/crosscheck";
import { HttpError } from "../shared/http";
import { resolveRoute, toTonnes, planningDirection } from "../intake/shipment-plan";
import type { Ledger } from "./ledger";

export async function loadCase(caseId: string) {
  const [{ getCase }, { createD1WorkflowRepository }] = await Promise.all([import("../cases/store"), import("../workflow/d1-repository")]);
  const found = await getCase(caseId);
  if (!found) throw new HttpError(404, `Case ${caseId} not found`);
  const published = await getProcedure(found.procedureId);
  if (!published) throw new HttpError(404, `Procedure ${found.procedureId} not found`);
  // Steps are judged against this shipment's workflow, not the bare published procedure.
  const procedure = tailorProcedure(published, parseFacts(found.shipmentFacts), found.query);
  return {
    found,
    procedure,
    published,
    runId: found.workflowRunId ?? `workflow:${caseId}`,
    repository: createD1WorkflowRepository(),
  };
}

export function checkContext(
  procedure: Procedure,
  facts: Partial<ShipmentFacts>,
  query: string,
  ledger: Ledger,
  stepNum?: number,
  excludeDocId?: string,
): CheckContext {
  const ends = resolveRoute(planningDirection(procedure.direction), { origin: facts.origin ?? null, destination: facts.destination ?? null }, query);
  const partner = procedure.direction === "export" ? ends.destination : ends.origin;
  return {
    intakeTonnes: toTonnes(facts.quantity ?? null, facts.unit ?? null, procedure.goods),
    partnerCountry: partner && !partner.assumed ? partner.place.country : null,
    direction: planningDirection(procedure.direction),
    goodsCategory: procedure.goods,
    stepNum: stepNum ?? null,
    documents: ledger.documents
      .filter((d) => d.docId !== excludeDocId && d.docType)
      .map((d) => ({ docType: d.docType!, label: d.label, fields: d.fields, stepNum: d.stepNum })),
  };
}

function parseFacts(raw: string | null | undefined): Partial<ShipmentFacts> | null {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
