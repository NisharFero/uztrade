/* What the step assistant renders: KPIs, the one next step, other steps open
 * in parallel, the documents on the case, and a short feed of what just
 * happened. */

import type { Procedure } from "../../data/procedures.generated";
import type { WorkflowProjection } from "../workflow-repository";
import { computeKpis, type Kpis } from "./kpis";
import { buildLedger, type DocumentRecord } from "./ledger";
import { openNodes, stepViewFor, type StepView } from "./next";
import { upfrontPlan, type UpfrontPlan } from "./upfront";

export type FeedItem = { text: string; actor: "agent" | "user" | "system" | "entity" };

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
  documents: DocumentRecord[];
  recent: FeedItem[];
};

function feed(projection: WorkflowProjection): FeedItem[] {
  const title = new Map(projection.nodes.map((n) => [n.id, `step ${n.stepNum} — ${n.title}`]));
  const items: FeedItem[] = [];
  for (const event of projection.auditEvents) {
    const where = event.nodeId ? title.get(event.nodeId) ?? "" : "";
    const data = event.data as Record<string, unknown>;
    switch (event.eventType) {
      case "agent_node_completed":
        items.push({ actor: "agent", text: `Agent completed ${where}` });
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
    }
  }
  return items.slice(-8).reverse();
}

export function assistantView(procedure: Procedure, projection: WorkflowProjection, caseId: string): AssistantView {
  const ledger = buildLedger(projection.artifacts);
  const open = openNodes(projection);
  return {
    upfront: upfrontPlan(procedure, ledger),
    caseId,
    procedureId: procedure.id,
    title: procedure.title,
    status: projection.run.status === "completed" ? "completed" : "active",
    kpis: computeKpis(procedure, projection, ledger),
    next: open[0] ? stepViewFor(procedure, projection, ledger, open[0]) : null,
    parallel: open.slice(1, 6).map((n) => ({ stepNum: n.stepNum, title: n.title, lane: n.lane, paused: n.lane === "agent" })),
    documents: ledger.documents,
    recent: feed(projection),
  };
}
