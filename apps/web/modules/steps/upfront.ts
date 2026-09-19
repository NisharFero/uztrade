/* What a trader can give at the start of a case instead of at the step.
 *
 * An input qualifies when (1) no earlier step produces it - it isn't a step's
 * output or an earlier step's result - and (2) the trader already holds or
 * issues it before the case starts. Inputs given upfront fill every later step
 * that needs them, so agent steps run without pausing when they're reached.
 * Everything else is listed with the reason it has to wait. */

import type { Procedure } from "../procedures/data/procedures.generated";
import { instantiateWorkflow, type ShipmentFacts } from "../workflow/domain";
import type { DocType } from "../documents/specs";
import type { WorkflowProjection } from "../workflow/repository";
import { formOfStep, formView, groupsOfStep, mergedPartyGroups, PARTY_GROUPS, resolveGroup, type FormView } from "./application-forms";
import { documentComplete, documentFor, inputKey, type DocumentRecord, type Ledger } from "./ledger";
import { stepViewFor } from "./next";

const NO_FACTS: ShipmentFacts = { goods: "", quantity: null, unit: null, origin: null, destination: null, mode: null };

export type UpfrontItem = {
  label: string;
  kind: "document" | "value" | "form";
  docType: DocType | null;
  /** Steps that use it, first first. */
  steps: number[];
  reason: string;
  status: "have" | "review" | "missing";
  value: string | null;
  /** The upload behind it, when there is one. */
  document: DocumentRecord | null;
  /** Portal application details (applicant, importer, …) given once for every application. */
  form: FormView | null;
};

export type LaterItem = { label: string; kind: "document" | "value" | "output"; steps: number[]; reason: string };

export type UpfrontPlan = { items: UpfrontItem[]; later: LaterItem[] };

/* Inputs a procedure lists as trader-supplied that nonetheless come out of
 * something that happens during the procedure. */
const LATER: [RegExp, string][] = [
  [/^payment sum$|^cost on the contract$/i, "The amount comes from the offer the agency issues at that step"],
  [/agreement with technological cent/i, "Concluded with the Technological Center earlier in the procedure"],
  [/agreement on railway transportation services/i, "Signed with the freight forwarder earlier in the procedure"],
  [/^invoice for (payment|prepayment)/i, "Issued by the service provider after you contract them"],
  [/(online|electronic) application/i, "Filled in on the portal during the step"],
  [/^package of documents$/i, "Assembled from the documents produced along the way"],
  [/iran approval letter/i, "Only for rail routes through Iran; issued by the Railway of Iran"],
  [/code notification/i, "Issued by the forwarder once contracted"],
  [/customs warehouse|warehouse license|guiding letter|letter to railway station/i, "Comes from the customs warehouse contracted during the procedure"],
  [/cargo delivery control book/i, "Issued by the railway on arrival"],
  [/exporter's country|food test report/i, "Sent by the exporter or the laboratory with the shipment"],
  [/vehicle (registration|entrance)/i, "The vehicle is assigned closer to delivery"],
  [/application for preliminary visual inspection|^documents requi/i, "Prepared during the inspection step"],
];

function upfrontReason(label: string, kind: "document" | "value", docType: DocType | null): string {
  if (kind === "value") return "Company profile or intake detail — known from the start";
  if (docType === "passport" || /power of attorney/i.test(label)) return "Your representative's own documents";
  if (/contract/i.test(label)) return "Signed before the case started";
  if (docType === "commercial_invoice") return "You issue it; the quantity is known from intake";
  if (/funds/i.test(label)) return "From your own bank, at any time";
  return "Your own document, form or letter";
}

export function upfrontPlan(procedure: Procedure, ledger: Ledger, facts: ShipmentFacts = NO_FACTS): UpfrontPlan {
  const runId = `upfront:${procedure.id}`;
  const workflow = instantiateWorkflow(procedure, runId);
  const projection: WorkflowProjection = {
    run: { id: runId, caseId: "upfront", procedureVersionId: `procedure:${procedure.id}:v1`, status: "running", cycle: 0 },
    shipmentFacts: NO_FACTS,
    nodes: workflow.nodes,
    edges: workflow.edges,
    workItems: [],
    agentRuns: [],
    artifacts: [],
    auditEvents: [],
  };
  const blank: Ledger = { inputs: new Map(), documents: [] };

  const items = new Map<string, UpfrontItem>();
  const later = new Map<string, LaterItem>();
  for (const node of workflow.nodes) {
    const view = stepViewFor(procedure, projection, blank, node);
    for (const need of [...view.needs, ...view.variants.flatMap((v) => v.needs)]) {
      if (need.kind !== "document" && need.kind !== "value") continue;
      const reason = need.output ? "Produced at this step" : LATER.find(([re]) => re.test(need.label))?.[1];
      if (reason) {
        const entry = later.get(need.label) ?? { label: need.label, kind: need.output ? "output" : need.kind, steps: [], reason };
        if (!entry.steps.includes(node.stepNum)) entry.steps.push(node.stepNum);
        later.set(need.label, entry);
        continue;
      }
      const entry = items.get(need.label) ?? {
        label: need.label,
        kind: need.kind,
        docType: need.docType,
        steps: [],
        reason: upfrontReason(need.label, need.kind, need.docType),
        status: "missing" as const,
        value: null,
        document: null,
        form: null,
      };
      if (!entry.steps.includes(node.stepNum)) entry.steps.push(node.stepNum);
      items.set(need.label, entry);
    }
  }

  // Portal applications: who the applications are about (applicant, importer,
  // exporter, supplier, payment) is known before the case starts and is the same
  // on every application - one set of details. General and product details
  // depend on the shipment's documents, so they wait for each application's step.
  const forms = procedure.blocks
    .flatMap((b) => b.steps)
    .sort((a, b) => a.num - b.num)
    .flatMap((st) => {
      const def = formOfStep(st.inputs);
      return def ? [{ def, groupKeys: groupsOfStep(st.inputs), stepNum: st.num }] : [];
    });
  const party = mergedPartyGroups(forms).map((g) => resolveGroup(g, { ledger, facts }));
  if (party.length) {
    const view = formView("application-details", "Application details", "Single Window", party);
    items.set("Application details", {
      label: "Application details",
      kind: "form",
      docType: null,
      steps: forms.map((f) => f.stepNum),
      reason: "Your company and your counterparties — the same on every Single Window application",
      status: view.complete ? "have" : "missing",
      value: null,
      document: null,
      form: view,
    });
  }
  for (const f of forms) {
    for (const key of f.groupKeys.filter((k) => !PARTY_GROUPS.includes(k))) {
      const group = f.def.groups.find((g) => g.key === key);
      if (!group) continue;
      const label = `${group.title} — ${f.def.title}`;
      later.set(label, { label, kind: "value", steps: [f.stepNum], reason: "Filled at the step from intake and the documents uploaded by then" });
    }
  }

  for (const item of items.values()) {
    if (item.kind === "form") continue;
    if (item.kind === "value") {
      const record = ledger.inputs.get(inputKey("value", 0, item.label));
      item.status = record ? "have" : "missing";
      item.value = record?.value ?? null;
    } else {
      const doc = documentFor(ledger, item.label, item.docType);
      item.document = doc ?? null;
      item.status = doc ? (documentComplete(doc) ? "have" : "review") : ledger.inputs.has(inputKey("confirm", 0, item.label)) ? "have" : "missing";
    }
  }

  const byFirstStep = <T extends { steps: number[] }>(a: T, b: T) => a.steps[0] - b.steps[0];
  return { items: [...items.values()].sort(byFirstStep), later: [...later.values()].sort(byFirstStep) };
}
