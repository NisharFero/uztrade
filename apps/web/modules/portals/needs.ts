/* An entity's answer as needs on the step. Each field it refused or wants
 * changed is a value the trader gives; the need is met once the case holds a
 * value the entity hasn't already seen for it - then the paused agent step
 * resumes and files again. Suggested fixes and the explanation worked out
 * when the entity answered (fixes.ts) travel with the need. */

import type { Procedure, ProcedureStep } from "../procedures/data/procedures.generated";
import type { Need } from "../steps/next";
import type { Ledger } from "../steps/ledger";
import type { WorkflowNodeRecord, WorkflowProjection } from "../workflow/repository";
import { latestRecords, portalView, type PortalRecord, type PortalView } from "./records";
import { resolveField, sourceContext, storageLabelFor, type SourceContext } from "./sources";

const ASKS: Record<PortalRecord["flags"][number]["kind"], string> = {
  missing: "asks for this",
  invalid: "can't accept this",
  change: "requests a change",
};

export function portalNeeds(record: PortalRecord, ctx: SourceContext): Need[] {
  if (record.status !== "rejected" && record.status !== "changes_requested") return [];
  return record.flags.map((flag) => {
    const field = { key: flag.field, label: flag.label, type: flag.type, refService: flag.refService ?? undefined };
    const resolved = resolveField(field, ctx);
    const fixed = Boolean(resolved?.value) && resolved!.value !== (flag.value ?? "");
    return {
      id: `${record.stepNum}:portal:${flag.field}`,
      label: storageLabelFor(field, ctx),
      kind: "value",
      status: fixed ? "have" : "missing",
      optional: false,
      detail: fixed
        ? `Goes to ${record.entityName} as “${resolved!.value}”`
        : `${record.entityName} ${ASKS[flag.kind]} — ${flag.reason}${flag.value ? ` (sent “${flag.value}”)` : ""}${flag.options.length ? `. One of: ${flag.options.join(", ")}` : ""}`,
      docType: null,
      requiredFields: [],
      document: null,
      producedBy: null,
      value: fixed ? resolved!.value : flag.value,
      autoFilled: false,
      output: false,
      form: null,
      notApplicable: false,
      suggestions: fixed ? [] : (flag.suggestions ?? []).filter((s) => s.value !== (flag.value ?? "")),
      explanation: fixed ? null : flag.explanation ?? null,
    };
  });
}

/** Where an agent step stands with its entity, and what the entity is waiting on. */
export function portalStep(procedure: Procedure, projection: WorkflowProjection, ledger: Ledger, step: ProcedureStep, node: WorkflowNodeRecord): { view: PortalView | null; needs: Need[] } {
  if (node.lane !== "agent") return { view: null, needs: [] };
  const record = latestRecords(projection).get(step.num);
  if (!record) return { view: null, needs: [] };
  return { view: portalView(record, step.title), needs: portalNeeds(record, sourceContext(procedure, step, projection, ledger)) };
}
