/* What the entities will ask for later, asked now.
 *
 * Every online agent step still ahead is checked against its entity's own form
 * rules - a dry run that files nothing - with the values the case holds today.
 * What comes back missing or malformed is collected into one list, so the
 * customs declaration's 10-digit HS code is asked at the start of the case
 * rather than at step 41, where finding it costs a round trip through the
 * whole step.
 *
 * The same field asked by several entities is one item, naming the steps that
 * want it. Values are never invented: each item carries the same suggestions
 * an entity's refusal would (fixes.ts). */

import type { Procedure } from "../procedures/data/procedures.generated";
import { buildLedger } from "../steps/ledger";
import type { Need } from "../steps/next";
import type { WorkflowProjection } from "../workflow/repository";
import { PortalUnavailable, portalService, validateApplication, type PortalClient } from "./client";
import type { FieldType } from "./contract";
import { helpForFlag } from "./fixes";
import { targetForStep } from "./agent";
import { buildFields, sourceContext, storageLabelFor } from "./sources";

export type ReadinessStep = { stepNum: number; title: string; entityName: string; serviceTitle: string; missing: number };

export type CaseReadiness = {
  /** Steps checked, in order. */
  steps: ReadinessStep[];
  /** One item per thing still to give, with the steps that want it. */
  needs: Need[];
  checked: number;
  /** An entity API could not be reached, so the list may be short. */
  unavailable: boolean;
};

/** Steps checked per call, so a case with 14 online steps stays one quick pass. */
const MAX_STEPS = 14;
/** Items given suggested values (each may ask a model to rank HS codes). */
const MAX_HELPED = 6;

const isDone = (state: string) => state === "completed" || state === "skipped";

export async function caseReadiness(procedure: Procedure, projection: WorkflowProjection, client: PortalClient): Promise<CaseReadiness> {
  const ledger = buildLedger(projection.artifacts);
  const steps: ReadinessStep[] = [];
  let unavailable = false;

  type Wanted = {
    label: string;
    field: string;
    type: FieldType;
    digits: number | null;
    options: string[];
    reason: string;
    kind: "missing" | "invalid" | "change";
    value: string | null;
    entity: string;
    steps: number[];
    context: ReturnType<typeof sourceContext>;
  };
  const wanted = new Map<string, Wanted>();

  const ahead = projection.nodes
    .filter((node) => node.lane === "agent" && !isDone(node.state))
    .sort((a, b) => a.stepNum - b.stepNum)
    .slice(0, MAX_STEPS);

  for (const node of ahead) {
    const step = procedure.blocks.flatMap((b) => b.steps).find((s) => s.num === node.stepNum);
    const target = step ? targetForStep(step) : null;
    if (!step || !target) continue;
    try {
      const service = await portalService(client, target.entity, target.service);
      const ctx = sourceContext(procedure, step, projection, ledger);
      const { fields } = buildFields(service.fields, ctx, target.fixed);
      const checked = await validateApplication(client, target.entity, target.service, fields);
      const flags = [...checked.missing, ...checked.invalid];
      steps.push({ stepNum: node.stepNum, title: node.title, entityName: service.entityName, serviceTitle: service.title, missing: flags.length });

      for (const flag of flags) {
        // A payment's amount and payee are known only once its invoice arrives; the payer's account is worth asking now.
        if (target.entity === "payments" && !flag.field.startsWith("payer.")) continue;
        const definition = service.fields.find((f) => f.key === flag.field);
        const label = storageLabelFor({ key: flag.field, label: flag.label }, ctx);
        const seen = wanted.get(label);
        if (seen) {
          seen.steps.push(node.stepNum);
          if (!seen.entity.includes(service.entityName)) seen.entity = `${seen.entity}, ${service.entityName}`;
          continue;
        }
        wanted.set(label, {
          label,
          field: flag.field,
          type: definition?.type ?? "text",
          digits: definition?.digits ?? null,
          options: definition?.options ?? [],
          reason: flag.reason,
          kind: flag.kind,
          value: flag.value,
          entity: service.entityName,
          steps: [node.stepNum],
          context: ctx,
        });
      }
    } catch (error) {
      if (!(error instanceof PortalUnavailable)) throw error;
      unavailable = true;
      break;
    }
  }

  const needs: Need[] = [];
  // Codes and choices first: they are the items whose suggestions are worth the work.
  const ordered = [...wanted.values()].sort((a, b) => Number(a.type !== "hs") - Number(b.type !== "hs") || a.steps[0] - b.steps[0]);
  for (const [index, item] of ordered.entries()) {
    const help =
      index < MAX_HELPED
        ? await helpForFlag(
            { field: item.field, label: item.label, kind: item.kind, reason: item.reason, value: item.value, type: item.type, refService: null, options: item.options, digits: item.digits },
            item.context,
            item.entity,
            client.llm,
          )
        : { suggestions: [], explanation: null };
    needs.push({
      id: `ahead:${item.field}`,
      label: item.label,
      kind: "value",
      status: "missing",
      optional: false,
      detail: `${item.entity} will ask for this at step${item.steps.length > 1 ? "s" : ""} ${item.steps.join(", ")} — ${item.reason}`,
      docType: null,
      requiredFields: [],
      document: null,
      producedBy: item.steps[0],
      value: item.value,
      autoFilled: false,
      output: false,
      form: null,
      notApplicable: false,
      suggestions: help.suggestions,
      explanation: help.explanation,
    });
  }

  return { steps, needs, checked: steps.length, unavailable };
}
