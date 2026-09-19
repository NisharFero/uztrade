/* The chat agent: reason about the message, then hand it to the one part of
 * the app that can answer it - intake, the trader's cases, or the published
 * procedures - and report each stage as it happens so the chat can stream it.
 *
 *   route  -> shipment   intake turn (a turn intake declines after all is
 *                        answered as a question instead)
 *          -> cases      digests of the selected cases, answered from them
 *          -> knowledge  cited answer from the procedures, plus FAQ entries
 *          -> other      what the assistant can help with */

import type { LlmClient } from "../ai/llm";
import { answerQuestion, type FaqAnswer } from "../faq/answer";
import { matchFaq, type FaqEntry } from "../faq/faq";
import type { IntakeTurn } from "../intake/conversation";
import type { IntakeDraft, Slot } from "../intake/draft";
import { intakeTurn } from "../intake/turn";
import { PROCEDURE_IDS, CATALOGUE } from "../procedures/data/procedures.generated";
import type { WorkflowProjection } from "../workflow/repository";
import { answerAboutCases, digestCase, selectCases, type CasesAnswer } from "./cases";
import { CASE_REF, routeMessage, type Routed } from "./router";

export type StageId = "route" | "intake" | "cases" | "knowledge";
export type Stage = { id: StageId; label: string; state: "running" | "done" | "failed"; detail?: string };

export type ChatResult =
  | { kind: "intake"; turn: IntakeTurn }
  | { kind: "cases"; answer: CasesAnswer }
  | { kind: "knowledge"; answer: FaqAnswer; faq: FaqEntry[] }
  | { kind: "other"; message: string; suggestions: string[] };

/** A next message the trader can send with one click. */
export type FollowUp = { label: string; text: string };

export type ChatEvent =
  | { type: "stage"; stage: Stage }
  | { type: "route"; routed: Routed }
  | { type: "result"; result: ChatResult; followUps: FollowUp[] }
  | { type: "error"; message: string }
  | { type: "done" };

type CaseRow = Parameters<typeof digestCase>[0] & { workflowRunId: string | null };

export type ChatDeps = {
  llm?: LlmClient;
  /** Newest first. Throws or returns [] when there is no database. */
  listCases: () => Promise<CaseRow[]>;
  projection: (runId: string) => Promise<WorkflowProjection | null>;
};

export type ChatInput = { message: string; draft: IntakeDraft; expecting: Slot | null };

const SUGGESTIONS = ["Which shipments are currently active?", "Who issues the phytosanitary certificate for tea?", "I want to export dried apricots by train"];

const ask = (text: string): FollowUp => ({ label: text, text });
const unique = (list: FollowUp[]) => list.filter((f, i) => list.findIndex((g) => g.text === f.text) === i).slice(0, 3);

/** What a trader would sensibly ask next about the cases just shown. */
export function caseFollowUps(answer: CasesAnswer): FollowUp[] {
  const [first] = answer.cases;
  if (!first) return [ask("I want to export tea by train"), ask("Which procedures are supported?")];
  if (answer.cases.length === 1) {
    const onYou = first.openSteps.find((s) => s.lane === "user");
    return unique([
      ...(onYou ? [ask(`What do I need for “${onYou.title}”?`)] : []),
      ask(`Which steps of ${first.id} are waiting on me?`),
      ask(first.status === "complete" ? "Which shipments are currently active?" : "Which of my other shipments are active?"),
    ]);
  }
  const waiting = answer.cases.find((c) => c.openSteps.some((s) => s.lane === "user"));
  return unique([
    ...(waiting ? [ask(`What is ${waiting.id} waiting on?`)] : []),
    ask("Which of my shipments are waiting on me?"),
    ask(answer.cases.every((c) => c.status === "complete") ? "Which shipments are currently active?" : "Which of my shipments are finished?"),
  ]);
}

/** Questions that follow from the passages an answer came from. */
/** `drafting`: a shipment is already being described, so no "Start: ..." */
export function knowledgeFollowUps(answer: FaqAnswer, drafting = false): FollowUp[] {
  const out: FollowUp[] = [];
  for (const source of answer.sources) {
    const [kind, id] = source.id.split(":");
    const p = CATALOGUE[id];
    if (!p) continue;
    if (kind === "step") {
      const title = source.title.split(": ").slice(1).join(": ");
      if (title) out.push(ask(`Who does “${title}” and what does it need?`));
    }
    out.push(ask(`How long does ${p.title.toLowerCase()} take?`));
    if (!drafting) out.push({ label: `Start: ${p.title}`, text: `I want to ${p.direction} ${p.goods} by ${p.mode}` });
  }
  return unique(out.length ? out : SUGGESTIONS.map(ask));
}

const INTENT_LABEL: Record<Routed["intent"], string> = {
  shipment: "Shipment details",
  cases: "About your cases",
  knowledge: "About the procedures",
  other: "Outside what I cover",
};

/** "export tea by train" for the shipment being described, if any. */
export function draftContext(draft: IntakeDraft): string {
  if (!draft.commodity) return "";
  return [draft.statedDirection, draft.commodity.category, draft.mode ? `by ${draft.mode}` : null].filter(Boolean).join(" ");
}

async function answerKnowledge(message: string, draft: IntakeDraft, deps: ChatDeps, emit: (e: ChatEvent) => void): Promise<void> {
  const context = draftContext(draft);
  emit({ type: "stage", stage: { id: "knowledge", label: context ? `Searching the procedures (${context})` : "Searching the published procedures", state: "running" } });
  const found = await answerQuestion(context ? `${message} (${context})` : message, deps.llm);
  const answer = { ...found, question: message };
  const faq = matchFaq(message, 2);
  const detail = answer.found
    ? `Answered from ${answer.sources.length} cited passage${answer.sources.length === 1 ? "" : "s"}`
    : [answer.withheld, `${answer.sources.length} close passages`].filter(Boolean).join(" ");
  emit({ type: "stage", stage: { id: "knowledge", label: "Searched the published procedures", state: "done", detail } });
  emit({ type: "result", result: { kind: "knowledge", answer, faq }, followUps: knowledgeFollowUps(answer, Boolean(context)) });
}

async function answerCases(message: string, routed: Routed, deps: ChatDeps, emit: (e: ChatEvent) => void): Promise<void> {
  emit({ type: "stage", stage: { id: "cases", label: "Looking up your cases", state: "running" } });
  let rows: CaseRow[] = [];
  try {
    rows = await deps.listCases();
  } catch {
    rows = [];
  }
  const known = new Set(rows.map((r) => r.id.toUpperCase()));
  const unknown = [...new Set((message.match(new RegExp(CASE_REF.source, "gi")) ?? []).map((m) => m.toUpperCase()))].filter((m) => !known.has(m));
  // A question about a case that doesn't exist is answered about that, not about every case.
  const selected = unknown.length && !routed.caseIds.length ? [] : selectCases(rows, routed).slice(0, 12);
  const digests = await Promise.all(
    selected.map(async (row) => {
      const projection = row.workflowRunId ? await deps.projection(row.workflowRunId).catch(() => null) : null;
      return digestCase(row, projection);
    }),
  );
  emit({
    type: "stage",
    stage: { id: "cases", label: "Looked up your cases", state: "done", detail: `${digests.length} of ${rows.length} case${rows.length === 1 ? "" : "s"} match` },
  });
  const answer = await answerAboutCases(message, digests, routed.caseIds.length ? "any" : routed.filter, deps.llm, unknown);
  emit({ type: "result", result: { kind: "cases", answer }, followUps: caseFollowUps(answer) });
}

export async function runChat(input: ChatInput, given: ChatDeps, emit: (e: ChatEvent) => void): Promise<void> {
  const { message, draft, expecting } = input;
  // Routing and the cases answer read the same list once.
  let listed: Promise<CaseRow[]> | null = null;
  const deps: ChatDeps = { ...given, listCases: () => (listed ??= given.listCases()) };
  try {
    emit({ type: "stage", stage: { id: "route", label: "Working out what you're asking", state: "running" } });
    let refs: { id: string; title: string; status: string }[] = [];
    try {
      refs = (await deps.listCases()).map((c) => ({ id: c.id, title: c.title, status: c.status }));
    } catch {
      refs = [];
    }
    const routed = await routeMessage(message, { draft, expecting, cases: refs }, deps.llm);
    emit({ type: "stage", stage: { id: "route", label: INTENT_LABEL[routed.intent], state: "done", detail: routed.reasoning } });
    emit({ type: "route", routed });

    if (routed.intent === "shipment") {
      emit({ type: "stage", stage: { id: "intake", label: "Reading the shipment details", state: "running" } });
      const turn = await intakeTurn(draft, message, expecting, deps.llm);
      if (turn.status === "declined") {
        emit({ type: "stage", stage: { id: "intake", label: "Not a shipment after all", state: "failed", detail: turn.message } });
        await answerKnowledge(message, draft, deps, emit);
      } else {
        const label = turn.status === "confirm" ? "Every shipment detail checks out" : "One more detail needed";
        emit({ type: "stage", stage: { id: "intake", label, state: "done" } });
        emit({ type: "result", result: { kind: "intake", turn }, followUps: turn.options.map((o) => ({ label: o.label, text: o.reply })) });
      }
    } else if (routed.intent === "cases") {
      await answerCases(message, routed, deps, emit);
    } else if (routed.intent === "knowledge") {
      await answerKnowledge(message, draft, deps, emit);
    } else {
      emit({
        type: "result",
        result: {
          kind: "other",
          message: `I can open and follow shipments under the ${PROCEDURE_IDS.length} published procedures, tell you where your cases stand, and answer questions about those procedures.`,
          suggestions: SUGGESTIONS,
        },
        followUps: SUGGESTIONS.map(ask),
      });
    }
  } catch (error) {
    emit({ type: "error", message: error instanceof Error ? error.message : "Unexpected error" });
  }
  emit({ type: "done" });
}
