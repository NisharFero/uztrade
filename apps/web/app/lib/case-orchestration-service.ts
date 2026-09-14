import { PROCEDURE_IDS, PROCEDURES } from "../data/procedures.generated";
import type { ShipmentFacts } from "../domain/workflow";
import { classify, type IntakeOptions } from "./classify";
import { createCase } from "./case-store";
import { startWorkflowForCase } from "./workflow-service";

export async function openCaseFromQuery(query: string, apiKey?: string, options: IntakeOptions = {}) {
  const match = await classify(query, apiKey, options);
  if (!match.procedureId) return { matched: false as const, match, supported: PROCEDURE_IDS.map((id) => ({ id, title: PROCEDURES[id].title })) };
  const created = await createCase({ procedureId: match.procedureId, query, matchedBy: match.matchedBy });
  const workflow = await startWorkflowForCase(created.id, PROCEDURES[match.procedureId], query, match.shipmentFacts);
  return { matched: true as const, match, case: created, workflow };
}

/** Opens a case from details the trader confirmed in the intake conversation -
 *  the procedure is already settled, so nothing is classified again. */
export async function openCaseFromIntake(input: { procedureId: string; query: string; facts: ShipmentFacts }) {
  const procedure = PROCEDURES[input.procedureId];
  if (!procedure) throw new Error(`Unknown procedure ${input.procedureId}`);
  const created = await createCase({ procedureId: input.procedureId, query: input.query, matchedBy: "rules" });
  const workflow = await startWorkflowForCase(created.id, procedure, input.query, input.facts);
  return { case: created, workflow };
}
