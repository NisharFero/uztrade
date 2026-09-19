/* What the step assistant renders: KPIs, the one next step, other steps open
 * in parallel, the documents on the case, where each application stands with
 * its entity, and a short feed of what just happened. */

import type { Procedure } from "../procedures/data/procedures.generated";
import { latestRecords, portalView, type PortalView } from "../portals/records";
import type { WorkflowProjection } from "../workflow/repository";
import { computeKpis, type Kpis } from "./kpis";
import { buildLedger, type DocumentRecord, type Ledger } from "./ledger";
import { openNodes, stepViewFor, type StepView } from "./next";
import { expiringItems, type ExpiringItem } from "./expiry";
import { caseSchedule, type CaseSchedule } from "./schedule";
import { caseTiming, type CaseTiming } from "./timing";
import { upfrontPlan, type UpfrontPlan } from "./upfront";

export type FeedItem = { text: string; actor: "agent" | "user" | "system" | "entity" };
export type CompletedStepSummary = {
  stepNum: number;
  title: string;
  status: "Success";
  timeTaken: string;
  timeSaved: string;
  remarks: string | null;
};

export type AssistantView = {
  /** What can be given at the start of the case, and what has to wait. */
  upfront: UpfrontPlan;
  caseId: string;
  procedureId: string;
  title: string;
  status: "active" | "completed";
  kpis: Kpis;
  next: StepView | null;
  parallel: { stepNum: number; title: string; lane: string; paused: boolean }[];
  completed: CompletedStepSummary[];
  documents: DocumentRecord[];
  /** Every application the agent filed with an entity API, latest decision per step. */
  portals: PortalView[];
  /** What to start now and what waiting costs, from the published estimates. */
  schedule: CaseSchedule;
  /** What the case has actually taken so far, from the stored timestamps. */
  timing: CaseTiming;
  /** Anything an entity or a document gave a validity date. */
  expiring: ExpiringItem[];
  recent: FeedItem[];
};

const flagText = (data: Record<string, unknown>) => ((data.flags as string[] | undefined) ?? []).join("; ") || "no reason given";

function feed(projection: WorkflowProjection): FeedItem[] {
  const title = new Map(projection.nodes.map((n) => [n.id, `step ${n.stepNum} — ${n.title}`]));
  const items: FeedItem[] = [];
  for (const event of projection.auditEvents) {
    const where = event.nodeId ? title.get(event.nodeId) ?? "" : "";
    const data = event.data as Record<string, unknown>;
    switch (event.eventType) {
      case "agent_node_completed":
        items.push({ actor: "agent", text: `Agent completed ${where}${data.reference ? ` — ${String(data.portal)} issued ${String(data.reference)}` : ""}` });
        break;
      case "agent_paused":
        items.push({ actor: "agent", text: `Agent paused at ${where} — needs ${(data.missing as string[] | undefined)?.join(", ") ?? "inputs"}` });
        break;
      case "agent_resumed":
        items.push({ actor: "agent", text: `Agent resumed ${where}` });
        break;
      case "work_item_completed":
        items.push({ actor: event.actorType, text: `Completed ${where}` });
        break;
      case "optional_node_skipped":
        items.push({ actor: "system", text: `Skipped ${where} (optional route)` });
        break;
      case "document_parsed":
        items.push({ actor: "agent", text: String(data.summary ?? "Parsed a document") });
        break;
      case "input_recorded":
        items.push({ actor: "user", text: `Recorded ${String(data.label ?? "an input")} (step ${String(data.stepNum ?? "?")})` });
        break;
      case "portal_under_review":
        items.push({ actor: "entity", text: `${String(data.entity)} accepted the ${String(data.service)} application ${String(data.reference ?? "")}${Number(data.revision) > 1 ? ` (revision ${String(data.revision)})` : ""} — under review` });
        break;
      case "portal_rejected":
        items.push({ actor: "entity", text: `${String(data.entity)} did not accept the ${String(data.service)} application — ${flagText(data)}` });
        break;
      case "portal_changes_requested":
        items.push({ actor: "entity", text: `${String(data.entity)} requested changes to ${String(data.reference ?? data.service)} — ${flagText(data)}` });
        break;
      case "portal_approved":
        items.push({ actor: "entity", text: `${String(data.entity)} approved ${String(data.reference ?? data.service)}` });
        break;
    }
  }
  return items.slice(-8).reverse();
}

const isDone = (state: string) => state === "completed" || state === "skipped";

function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function estimatedMinutes(step: StepView): number {
  const text = `${step.title} ${step.entity} ${step.channel}`;
  if (/customs|declaration|foreign economic activity/i.test(text)) return step.lane === "agent" ? 35 : 45;
  if (/bank|pay|payment|receipt/i.test(text)) return 20;
  if (/railway|e-nakl|wagon|smgs|waybill|freight/i.test(text)) return step.lane === "physical" ? 120 : 40;
  if (/inspection|phytosanitary|quarantine|sample|fumigat/i.test(text)) return step.lane === "physical" ? 150 : 55;
  if (/origin|expertiza|certificat/i.test(text)) return step.lane === "physical" ? 120 : 60;
  if (step.lane === "agent") return 18;
  if (step.lane === "physical") return 120;
  return /^in person/i.test(step.channel) ? 75 : 25;
}

function savedMinutes(step: StepView): number {
  return step.lane === "agent" ? 45 : 0;
}

function hasDocument(ledger: Ledger, re: RegExp): boolean {
  return ledger.documents.some((doc) => re.test(`${doc.label} ${doc.fileName} ${doc.docType ?? ""}`));
}

function remarksFor(step: StepView, ledger: Ledger): string | null {
  const text = `${step.title} ${step.entity} ${step.output} ${step.where}`;
  const invoice = hasDocument(ledger, /invoice/i);
  const contract = hasDocument(ledger, /contract/i);
  const railwayBill = hasDocument(ledger, /railway bill|smgs|waybill/i);
  const receipt = hasDocument(ledger, /receipt|payment/i);

  if (step.portal?.status === "approved") {
    const issued = Object.entries(step.portal.outputs).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ");
    return `${step.portal.entityName} API: ${step.portal.serviceTitle} ${step.portal.reference ?? ""} approved${step.portal.revision > 1 ? ` after ${step.portal.revision - 1} amendment${step.portal.revision > 2 ? "s" : ""}` : ""}${issued ? ` — ${issued}` : ""} (sandbox).`;
  }
  if (/customs|declaration|foreign economic activity/i.test(text)) {
    const evidence = [
      invoice ? "invoice" : null,
      contract ? "contract" : null,
      railwayBill ? "transport document" : null,
      "HS heading",
    ].filter(Boolean);
    return `Customs/SCC: declaration work used ${evidence.join(", ")} available in the case; final submission remains the user's signed legal responsibility.`;
  }
  if (/bank|pay|payment|receipt/i.test(text)) {
    return `Bank/payment: payment is completed outside the system; ${receipt ? "uploaded receipt details can be checked against the case reference and amount" : "upload the receipt so payer, date and purpose can be checked"}.`;
  }
  if (/railway|e-nakl|wagon|smgs|waybill|freight/i.test(text)) {
    return `Railway/e-waybill: wagon and route details should match the declared quantity, consignee, destination station and attached documents; border handover may re-check seals.`;
  }
  if (/inspection|phytosanitary|quarantine|sample|fumigat/i.test(text)) {
    return `Physical inspection: goods should be available at the stated location; inspector may check packaging, seals, samples and supporting documents before issuing the result.`;
  }
  if (/origin|expertiza|certificat/i.test(text)) {
    return `Certification: origin/certificate work depends on invoice, goods-origin evidence and any required expert review; destination rules decide the expected form.`;
  }
  return null;
}

function completedSteps(procedure: Procedure, projection: WorkflowProjection, ledger: Ledger): CompletedStepSummary[] {
  return projection.nodes
    .filter((node) => isDone(node.state))
    .sort((a, b) => a.stepNum - b.stepNum)
    .map((node) => {
      const step = stepViewFor(procedure, projection, ledger, node);
      const saved = savedMinutes(step);
      return {
        stepNum: step.stepNum,
        title: step.title,
        status: "Success",
        timeTaken: `${minutesLabel(estimatedMinutes(step))} est.`,
        timeSaved: saved ? minutesLabel(saved) : "0 min",
        remarks: remarksFor(step, ledger),
      };
    });
}

export function assistantView(procedure: Procedure, projection: WorkflowProjection, caseId: string): AssistantView {
  const ledger = buildLedger(projection.artifacts);
  const open = openNodes(projection);
  const stepTitle = new Map(projection.nodes.map((n) => [n.stepNum, n.title]));
  const schedule = caseSchedule(procedure, projection);
  return {
    upfront: upfrontPlan(procedure, ledger, projection.shipmentFacts),
    caseId,
    procedureId: procedure.id,
    title: procedure.title,
    status: projection.run.status === "completed" ? "completed" : "active",
    kpis: computeKpis(procedure, projection, ledger),
    next: open[0] ? stepViewFor(procedure, projection, ledger, open[0]) : null,
    parallel: open.slice(1, 6).map((n) => ({ stepNum: n.stepNum, title: n.title, lane: n.lane, paused: n.lane === "agent" })),
    completed: completedSteps(procedure, projection, ledger),
    documents: ledger.documents,
    schedule,
    timing: caseTiming(projection),
    expiring: expiringItems({ projection, ledger, remainingHours: schedule.remainingHours }),
    portals: [...latestRecords(projection).values()].sort((a, b) => a.stepNum - b.stepNum).map((r) => portalView(r, stepTitle.get(r.stepNum) ?? r.serviceTitle)),
    recent: feed(projection),
  };
}
