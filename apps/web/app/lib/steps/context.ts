/* Loads a case for the step APIs and builds what cross-checks compare against. */

import { PROCEDURES, type Procedure } from "../../data/procedures.generated";
import type { ShipmentFacts } from "../../domain/workflow";
import type { CheckContext } from "../docai/crosscheck";
import { HttpError } from "../http";
import { resolveRoute, toTonnes } from "../shipment-plan";
import type { Ledger } from "./ledger";

export async function loadCase(caseId: string) {
  const [{ getCase }, { createD1WorkflowRepository }] = await Promise.all([import("../case-store"), import("../d1-workflow-repository")]);
  const found = await getCase(caseId);
  if (!found) throw new HttpError(404, `Case ${caseId} not found`);
  const procedure = PROCEDURES[found.procedureId];
  if (!procedure) throw new HttpError(404, `Procedure ${found.procedureId} not found`);
  return {
    found,
    procedure,
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
  const ends = resolveRoute(procedure.direction, { origin: facts.origin ?? null, destination: facts.destination ?? null }, query);
  const partner = procedure.direction === "export" ? ends.destination : ends.origin;
  return {
    intakeTonnes: toTonnes(facts.quantity ?? null, facts.unit ?? null, procedure.goods),
    partnerCountry: partner && !partner.assumed ? partner.place.country : null,
    direction: procedure.direction,
    goodsCategory: procedure.goods,
    stepNum: stepNum ?? null,
    documents: ledger.documents
      .filter((d) => d.docId !== excludeDocId && d.docType)
      .map((d) => ({ docType: d.docType!, label: d.label, fields: d.fields, stepNum: d.stepNum })),
  };
}
