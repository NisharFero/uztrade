/* Who is working on the shipment, and what each of them is doing right now.
 *
 * Every state here is read from the case itself - the intake turn, the
 * orchestrator's view, the documents in the ledger, the risk report and the
 * transit view - never made up for effect. An agent the trader has to answer
 * is "needs you"; one busy with the case or an entity is "working"; anything
 * else is "idle". The rail and the message avatars share these identities.
 */

import type { IntakeTurn } from "../intake/conversation";
import type { RiskReport } from "../compliance/risk";
import type { AssistantView } from "../steps/assistant";
import type { TransitView } from "../transit/transit";

export type AgentId = "assistant" | "orchestrator" | "documents" | "risk" | "transit";
export type AgentState = "working" | "needs-you" | "idle";

export type AgentStatus = {
  id: AgentId;
  state: AgentState;
  /** One sentence: what it is doing or waiting for, right now. */
  now: string;
  /** A few facts behind that sentence, newest first. */
  details: string[];
};

export const AGENTS: Record<AgentId, { name: string; short: string; role: string }> = {
  assistant: { name: "Trade assistant", short: "Intake", role: "Reads what you are moving, asks for what is missing and matches the published procedure." },
  orchestrator: { name: "Orchestrator", short: "Workflow", role: "Runs the case step by step, decides what comes next and hands work to the other agents." },
  documents: { name: "Document agent", short: "Documents", role: "Reads every document you send and checks it against the shipment." },
  risk: { name: "Risk & compliance", short: "Risk", role: "Checks HS code, duties and the risk rules against the shipment." },
  transit: { name: "Transit agent", short: "Transit", role: "Follows the route, the borders and when the goods can move." },
};

export const AGENT_ORDER: AgentId[] = ["assistant", "orchestrator", "documents", "risk", "transit"];

export const STATE_LABEL: Record<AgentState, string> = { working: "Working", "needs-you": "Needs you", idle: "Idle" };

export type StatusInput = {
  /** A chat request is in flight, answered by this agent. */
  thinking: AgentId | null;
  turn: IntakeTurn | null;
  caseId: string | null;
  view: AssistantView | null;
  /** The action in flight on the case: "complete", "sync", "upload:<need>", ... */
  busy: string | null;
  risk: RiskReport | null;
  transit: TransitView | null;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function assistant(i: StatusInput): AgentStatus {
  const base = { id: "assistant" as const, details: [] as string[] };
  if (i.thinking === "assistant") return { ...base, state: "working", now: "Reading your message and looking up the published procedures." };
  if (i.caseId) return { ...base, state: "idle", now: `Handed case ${i.caseId} to the orchestrator.`, details: i.view ? [`Matched procedure ${i.view.procedureId}: ${i.view.title}`] : [] };
  const t = i.turn;
  if (t?.status === "confirm" && t.summary)
    return { ...base, state: "needs-you", now: `Matched “${t.summary.title}”. Waiting for you to open the case.`, details: t.progress.filter((p) => p.value).map((p) => `${p.label}: ${p.value}`) };
  if (t?.status === "asking") {
    const missing = t.progress.filter((p) => !p.done);
    return {
      ...base,
      state: "needs-you",
      now: `Waiting for your answer: ${(missing.find((p) => p.slot === t.slot) ?? missing[0])?.label.toLowerCase() ?? "one more detail"}.`,
      details: [
        ...t.progress.filter((p) => p.done && p.value).map((p) => `Have ${p.label.toLowerCase()}: ${p.value}`),
        ...(missing.length > 1 ? [`Still to ask, one at a time: ${missing.map((p) => p.label.toLowerCase()).join(", ")}`] : []),
      ],
    };
  }
  return { ...base, state: "idle", now: "Waiting for you to say what you are moving." };
}

function orchestrator(i: StatusInput): AgentStatus {
  const base = { id: "orchestrator" as const };
  const v = i.view;
  if (!i.caseId || !v) return { ...base, state: "idle", now: "Starts once a case is open.", details: [] };
  const details = [`${v.kpis.completed} of ${v.kpis.total} steps done`, ...v.recent.slice(0, 3).map((r) => r.text)];
  if (i.busy === "complete") return { ...base, state: "working", now: "Completing the step and working out what comes next.", details };
  if (i.thinking === "orchestrator") return { ...base, state: "working", now: "Looking up your question in the case and its procedure.", details };
  if (v.status === "completed") return { ...base, state: "idle", now: "Every step is done.", details };
  const s = v.next;
  if (!s) return { ...base, state: "working", now: `Nothing needs you. ${plural(v.parallel.length, "step")} still running at the entities.`, details };
  if (s.lane === "agent" && !s.paused) return { ...base, state: "working", now: `Filing step ${s.stepNum}, ${s.title}, with ${s.entity || "the entity"}.`, details };
  if (s.ready) return { ...base, state: "needs-you", now: `Step ${s.stepNum} has everything it needs. Waiting for you to complete it.`, details };
  return {
    ...base,
    state: "needs-you",
    now: `Step ${s.stepNum}, ${s.title}, is waiting on ${s.blocking.length ? s.blocking.join(", ").toLowerCase() : "you"}.`,
    details,
  };
}

function documents(i: StatusInput): AgentStatus {
  const base = { id: "documents" as const };
  const v = i.view;
  if (i.busy?.startsWith("upload:")) return { ...base, state: "working", now: "Reading the document you sent and checking it against the shipment.", details: [] };
  if (!v) return { ...base, state: "idle", now: "Reads each document when its step asks for it.", details: [] };
  const details = v.documents
    .slice(-4)
    .reverse()
    .map((d) => `${d.label} (${d.fileName}): ${d.parseError ? "could not be read" : d.confirmed ? "confirmed" : "waiting for your check"}`);
  const mismatch = v.documents.flatMap((d) => d.checks.filter((c) => c.status === "mismatch").map((c) => `${d.label}: ${c.detail}`))[0];
  if (mismatch) return { ...base, state: "needs-you", now: `Found a mismatch. ${mismatch}`, details };
  const toCheck = v.documents.flatMap((d) => d.fields.filter((f) => f.status === "review")).length;
  if (toCheck) return { ...base, state: "needs-you", now: `${plural(toCheck, "field")} in your documents need your check.`, details };
  const wanted = v.next?.needs.find((n) => n.kind === "document" && n.status === "missing" && !n.optional);
  if (wanted) return { ...base, state: "needs-you", now: `Waiting for the ${wanted.label.toLowerCase()} for step ${v.next!.stepNum}.`, details };
  if (!v.documents.length) return { ...base, state: "idle", now: "Nothing to read yet. Each document is asked for at its own step.", details };
  return { ...base, state: "idle", now: `${plural(v.documents.length, "document")} read and checked.`, details };
}

function risk(i: StatusInput): AgentStatus {
  const base = { id: "risk" as const };
  if (!i.caseId) return { ...base, state: "idle", now: "Checks the shipment once a case is open.", details: [] };
  const r = i.risk;
  if (!r) return { ...base, state: "working", now: "Running the risk rules against the shipment.", details: [] };
  const flagged = r.rows.filter((x) => x.status === "high" || x.status === "caution");
  const pending = r.rows.filter((x) => x.status === "pending").length;
  const details = [...flagged.map((x) => `${x.title}: ${x.reason}`), ...(pending ? [`${plural(pending, "check")} wait for later steps`] : [])];
  if (flagged.length) return { ...base, state: "needs-you", now: riskSummary(r), details };
  return { ...base, state: "idle", now: `No rule is flagged${pending ? `; ${plural(pending, "check")} wait for their steps` : ""}.`, details };
}

/** What the risk agent says when a rule is flagged, in one sentence. */
export function riskSummary(r: RiskReport): string {
  const flagged = r.rows.filter((x) => x.status === "high" || x.status === "caution");
  if (!flagged.length) return "No rule is flagged.";
  return `${flagged.length === 1 ? "One thing" : `${flagged.length} things`} to check before customs: ${flagged.map((x) => x.title).join(", ")}.`;
}

function transit(i: StatusInput): AgentStatus {
  const base = { id: "transit" as const };
  if (!i.caseId) return { ...base, state: "idle", now: "Follows the route once a case is open.", details: [] };
  const t = i.transit;
  if (!t) return { ...base, state: "idle", now: "No route recorded for this case yet.", details: [] };
  const r = t.route;
  const details = [
    ...(r ? [`${r.origin} to ${r.destination}${r.distanceKm ? `, about ${r.distanceKm.toLocaleString("en-US")} km` : ""}${r.borders ? `, ${plural(r.borders, "border")}` : ""}`] : []),
    ...t.references.slice(0, 2).map((x) => `${x.label}: ${x.value}`),
  ];
  const problem = t.exceptions.find((e) => e.severity !== "info" && e.handOff !== "risk");
  if (problem) return { ...base, state: "needs-you", now: `${problem.title}. ${problem.detail}`, details };
  if (t.status.next) return { ...base, state: "idle", now: `${t.status.label}. The goods move after step ${t.status.next.stepNum}, ${t.status.next.title}.`, details };
  return { ...base, state: "idle", now: `${t.status.label}.`, details };
}

export function agentStatuses(input: StatusInput): AgentStatus[] {
  const all = { assistant: assistant(input), orchestrator: orchestrator(input), documents: documents(input), risk: risk(input), transit: transit(input) };
  return AGENT_ORDER.map((id) => all[id]);
}
