import { CATALOGUE, PROCEDURE_IDS } from "../procedures/data/procedures.generated";
import { getProcedure, requireProcedure } from "../procedures/registry";
import type { ShipmentFacts } from "../workflow/domain";
import { classify, type IntakeOptions } from "../intake/classify";
import { createCase } from "./store";
import { startWorkflowForCase } from "../workflow/service";
import { tailorProcedure } from "../workflow/tailor";
import type { AgenticAiClient } from "../workflow/agentic-ai";
import type { PortalClient } from "../portals/client";

type OpenCaseOptions = IntakeOptions & { ai?: AgenticAiClient; portals?: PortalClient };

export async function openCaseFromQuery(query: string, apiKey?: string, options: OpenCaseOptions = {}) {
  const match = await classify(query, apiKey, options);
  if (!match.procedureId) return { matched: false as const, match, supported: PROCEDURE_IDS.map((id) => ({ id, title: CATALOGUE[id].title })) };
  const matched = await requireProcedure(match.procedureId);
  const title = tailorProcedure(matched, match.shipmentFacts, query).title;
  const created = await createCase({ procedureId: match.procedureId, query, matchedBy: match.matchedBy, title });
  const workflow = await startWorkflowForCase(created.id, matched, query, match.shipmentFacts, { ai: options.ai, portals: options.portals });
  return { matched: true as const, match, case: created, workflow, procedure: matched };
}

/** Opens a case from details the trader confirmed in the intake conversation -
 *  the procedure is already settled, so nothing is classified again. */
export async function openCaseFromIntake(input: { procedureId: string; query: string; facts: ShipmentFacts }, options: { ai?: AgenticAiClient; portals?: PortalClient } = {}) {
  const procedure = await getProcedure(input.procedureId);
  if (!procedure) throw new Error(`Unknown procedure ${input.procedureId}`);
  const created = await createCase({ procedureId: input.procedureId, query: input.query, matchedBy: "rules", title: tailorProcedure(procedure, input.facts, input.query).title });
  const workflow = await startWorkflowForCase(created.id, procedure, input.query, input.facts, options);
  return { case: created, workflow, procedure };
}
