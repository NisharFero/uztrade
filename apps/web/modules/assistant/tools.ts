import { assistantView, type AssistantView } from "../steps/assistant";
import { briefDocumentUpload, briefStep } from "../steps/briefing";
import { getProcedure } from "../procedures/registry";
import type { WorkflowProjection } from "../workflow/repository";
import type { CaseDigest } from "./cases";

export type ToolCase = {
  id: string;
  procedureId: string;
  digest: CaseDigest;
  projection: WorkflowProjection | null;
};

const DOCS = /\b(doc|docs|document|documents|upload|provide|required|missing|field|fields|detail|details)\b/i;
const STEP = /\b(next|step|steps|waiting|stuck|blocked|need|needs|needed|do now|what should i do)\b/i;
const RISK = /\b(risk|verify|verified|check|checked|mismatch)\b/i;
const ETA = /\b(eta|finish|finished|complete|completed|when|how long|timeline|time left|duration)\b/i;
const STATUS = /\b(status|progress|where is|where are|current|started|done|left)\b/i;
const AGENTS = /\b(agent|agents|tool|tools|reasoning|document analysis|transit agent|risk agent)\b/i;

const compact = (lines: string[]) => lines.filter((line) => line.trim()).join("\n\n");

const hours = (range: [number, number]): string => {
  const days = range[1] >= 48;
  const value = (n: number) => (days ? Math.round(n / 24) : Math.round(n));
  const unit = days ? "days" : "hours";
  const low = value(range[0]);
  const high = value(range[1]);
  return low === high ? `${high} ${unit}` : `${low}-${high} ${unit}`;
};

function firstCase(cases: ToolCase[]): ToolCase | null {
  return cases.length === 1 ? cases[0] : cases.find((c) => c.digest.status !== "complete") ?? cases[0] ?? null;
}

function missingLine(view: AssistantView): string | null {
  if (!view.next) return `${view.title} has no open step right now.`;
  const brief = briefStep(view.next);
  const lines = [brief.headline, ...brief.paragraphs];
  return compact(lines);
}

function documentsLine(view: AssistantView): string | null {
  const latest = [...view.documents].reverse()[0];
  if (!latest) return "I do not have any uploaded documents on this case yet.";
  return compact(briefDocumentUpload(latest));
}

function riskLine(view: AssistantView): string | null {
  const checks = view.documents.flatMap((doc) => doc.checks.map((check) => ({ ...check, doc: doc.label })));
  if (!checks.length) return "The risk agent needs at least one uploaded document before it can compare route, weight, value, parties and customs details.";

  const bad = checks.filter((check) => check.status === "mismatch");
  const ok = checks.filter((check) => check.status === "ok");
  const unknown = checks.filter((check) => check.status === "unknown");

  if (bad.length) {
    const first = bad[0];
    return `The risk agent found a mismatch on ${first.doc}: ${first.check}. ${first.detail}. Please confirm or upload a corrected document before we move on.`;
  }
  const parts = [
    ok.length ? `${ok.length} check${ok.length === 1 ? "" : "s"} passed` : null,
    unknown.length ? `${unknown.length} still need more evidence` : null,
  ].filter(Boolean);
  return `The risk agent has ${parts.join(", ") || "not found any blocking issue"} across the uploaded documents.`;
}

function etaLine(view: AssistantView): string {
  const eta = view.schedule?.remainingHours ?? view.kpis.etaHours;
  const next = view.next ? ` The next open step is ${view.next.title}.` : "";
  const longPole = view.schedule?.longPole ? ` The longest remaining stage is ${view.schedule.longPole.blockName}.` : "";
  return `Estimated time left is ${hours(eta)} from the published workflow and current progress.${next}${longPole}`;
}

function statusLine(view: AssistantView): string {
  const k = view.kpis;
  const next = view.next ? `Next: step ${view.next.stepNum}, ${view.next.title}.` : "No open step right now.";
  return `${k.completed}/${k.total} steps are complete (${k.percent}%). ${next}`;
}

function agentsLine(view: AssistantView): string {
  const latestDoc = [...view.documents].reverse()[0];
  const doc = latestDoc ? `Document analysis is on ${latestDoc.label}.` : "Document analysis is waiting for the first upload.";
  const risk = riskLine(view) ?? "Risk analysis has no current blocker.";
  const transit = view.next ? `Transit agent is tracking step ${view.next.stepNum}: ${view.next.title}.` : "Transit agent is standing by.";
  return compact([doc, risk, transit]);
}

function digestStepLine(c: ToolCase): string {
  const onYou = c.digest.openSteps.filter((step) => step.lane === "user");
  const open = onYou.length ? onYou : c.digest.openSteps;
  if (!open.length) return `${c.digest.title} has no open step right now.`;
  const lines = open.slice(0, 4).map((step) => `Step ${step.stepNum}: ${step.title} - waiting on ${step.lane === "user" ? "you" : step.lane === "agent" ? "the agent" : "the goods in person"}.`);
  return compact(lines);
}

function digestRiskLine(c: ToolCase): string {
  const first = c.digest.openSteps[0];
  if (!first) return "The risk agent has no open issue from the current case state.";
  return `The risk agent has no uploaded document evidence to verify yet. Current case state is step ${first.stepNum}, ${first.title}, waiting on ${first.lane === "user" ? "you" : first.lane === "agent" ? "the agent" : "the goods in person"}.`;
}

async function digestEtaLine(c: ToolCase): Promise<string> {
  const procedure = await getProcedure(c.procedureId);
  const estimate = procedure?.timeframe ? `The usual full-flow estimate is ${hours(procedure.timeframe)}.` : "I do not have a reliable ETA from this case state yet.";
  const progress = `${c.digest.stagesDone}/${c.digest.stagesTotal} stages are done.`;
  const next = c.digest.openSteps[0] ? ` Current step is ${c.digest.openSteps[0].title}.` : "";
  return `${estimate} ${progress}${next}`;
}

function digestStatusLine(c: ToolCase): string {
  const next = c.digest.openSteps[0] ? `Next: step ${c.digest.openSteps[0].stepNum}, ${c.digest.openSteps[0].title}.` : "No open step right now.";
  return `${c.digest.stagesDone}/${c.digest.stagesTotal} stages are done. ${next}`;
}

function digestAgentsLine(c: ToolCase): string {
  const first = c.digest.openSteps[0];
  return compact([
    "Document analysis is waiting for the first upload.",
    digestRiskLine(c),
    first ? `Transit agent is tracking step ${first.stepNum}: ${first.title}.` : "Transit agent is standing by.",
  ]);
}

async function viewFor(c: ToolCase): Promise<AssistantView | null> {
  if (!c.projection) return null;
  const procedure = await getProcedure(c.procedureId);
  const steps = procedure?.blocks.flatMap((block) => block.steps.map((step) => ({ block, step }))) ?? [];
  const nodes = (c.projection.nodes ?? []).map((node) => {
    const found = steps.find(({ step }) => step.num === node.stepNum);
    return {
      ...node,
      id: node.id ?? `${c.id}:step:${node.stepNum}`,
      runId: node.runId ?? c.projection?.run?.id ?? "",
      blockId: node.blockId ?? found?.block.id ?? "",
      blockName: node.blockName ?? found?.block.name ?? "",
      output: node.output ?? found?.step.output ?? "",
      entityName: node.entityName ?? found?.step.entity ?? "",
      channel: node.channel ?? found?.step.channel ?? "",
      delegationReason: node.delegationReason ?? "",
      optional: node.optional ?? false,
    };
  });
  const projection = {
    ...c.projection,
    run: c.projection.run ?? { id: "", caseId: c.id, procedureVersionId: c.procedureId, status: "running", cycle: 0 },
    shipmentFacts: c.projection.shipmentFacts ?? {},
    nodes,
    edges: c.projection.edges ?? [],
    workItems: c.projection.workItems ?? [],
    agentRuns: c.projection.agentRuns ?? [],
    artifacts: c.projection.artifacts ?? [],
    auditEvents: c.projection.auditEvents ?? [],
  } as WorkflowProjection;
  return procedure ? assistantView(procedure, projection, c.id) : null;
}

export async function answerWithCaseTools(question: string, cases: ToolCase[]): Promise<string | null> {
  const selected = firstCase(cases);
  if (!selected) return null;

  const wantsDocs = DOCS.test(question);
  const wantsStep = STEP.test(question);
  const wantsRisk = RISK.test(question);
  const wantsEta = ETA.test(question);
  const wantsStatus = STATUS.test(question);
  const wantsAgents = AGENTS.test(question);
  if (!wantsDocs && !wantsStep && !wantsRisk && !wantsEta && !wantsStatus && !wantsAgents) return null;

  const view = await viewFor(selected);

  const head = `${selected.digest.title} (${selected.id})`;
  if (view && wantsRisk) return `${head}\n\n${riskLine(view)}`;
  if (view && wantsEta) return `${head}\n\n${etaLine(view)}`;
  if (view && wantsAgents) return `${head}\n\n${agentsLine(view)}`;
  if (view && wantsDocs) return `${head}\n\n${documentsLine(view)}\n\n${missingLine(view)}`;
  if (view && wantsStatus) return `${head}\n\n${statusLine(view)}`;
  if (view) return `${head}\n\n${missingLine(view)}`;
  if (wantsRisk) return `${head}\n\n${digestRiskLine(selected)}`;
  if (wantsEta) return `${head}\n\n${await digestEtaLine(selected)}`;
  if (wantsAgents) return `${head}\n\n${digestAgentsLine(selected)}`;
  if (wantsDocs) return `${head}\n\nI do not have any uploaded documents on this case yet.\n\n${digestStepLine(selected)}`;
  if (wantsStatus) return `${head}\n\n${digestStatusLine(selected)}`;
  return `${head}\n\n${digestStepLine(selected)}`;
}
