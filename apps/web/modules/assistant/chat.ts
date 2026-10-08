/* The chat agent: reason about the message, then hand it to the one part of
 * the app that can answer it - intake, the trader's cases, or the published
 * procedures - and report each stage as it happens so the chat can stream it.
 *
 *   route  -> shipment   intention first (intention.ts): someone finding out
 *                        gets what it involves and one question; someone
 *                        starting gets intake. A turn intake declines after
 *                        all is answered as a question instead. Nothing here
 *                        opens a case - only the trader's yes does.
 *          -> estimate   how long, from the published timeframe and the route
 *          -> cases      digests of the selected cases, answered from them
 *          -> knowledge  cited answer from the procedures, plus FAQ entries
 *          -> other      what the assistant can help with */

import type { LlmClient } from "../ai/llm";
import { answerQuestion, type FaqAnswer } from "../faq/answer";
import { matchFaq, type FaqEntry } from "../faq/faq";
import type { IntakeTurn } from "../intake/conversation";
import type { IntakeDraft, Slot } from "../intake/draft";
import { intakeTurn } from "../intake/turn";
import { correctTypos } from "../intake/typos";
import { PROCEDURE_IDS, CATALOGUE } from "../procedures/data/procedures.generated";
import type { WorkflowProjection } from "../workflow/repository";
import { answerAboutCases, digestCase, selectCases, type CasesAnswer } from "./cases";
import { CASE_REF, routeMessage, type Routed } from "./router";
import { brief, say, chunksOf, type ReplyActions } from "./say";
import { answerWithCaseTools } from "./tools";
import { ESTIMATE_QUESTION, estimateFor, goalOf, needsOf, overviewFor, type Estimate, type Overview, type ShipmentNeeds } from "./intention";

export type StageId = "route" | "intake" | "cases" | "knowledge";
export type Stage = { id: StageId; label: string; state: "running" | "done" | "failed"; detail?: string };

export type ChatResult =
  /** `needs` is filled once the shipment is complete: what the procedure will
   *  ask the trader for, so the summary can say it before the case exists.
   *  `overview` is filled for someone finding out: every way the goods can go,
   *  how long each takes, and what the likeliest one needs. */
  | { kind: "intake"; turn: IntakeTurn; needs?: ShipmentNeeds; overview?: Overview }
  | { kind: "estimate"; estimate: Estimate }
  | { kind: "cases"; answer: CasesAnswer }
  | { kind: "knowledge"; answer: FaqAnswer; faq: FaqEntry[] }
  | { kind: "other"; message: string; suggestions: string[] };

export type { ShipmentNeeds };

/** A next message the trader can send with one click. */
export type FollowUp = { label: string; text: string };

export type ChatEvent =
  | { type: "stage"; stage: Stage }
  | { type: "route"; routed: Routed }
  /** The answer as it is written, a few words at a time. */
  | { type: "text"; chunk: string }
  /** What the finished reply offers: a case to open, a case to look at, taps. */
  | { type: "actions"; actions: ReplyActions }
  /** The whole result, for the parts of the client that still need the data
   *  (the intake draft the next message is read against). */
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

export type ChatInput = { message: string; draft: IntakeDraft; expecting: Slot | null; caseId?: string | null; presentation?: "cards" | "text" };

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
  estimate: "How long it takes",
  cases: "About your cases",
  knowledge: "About the procedures",
  other: "Outside what I cover",
};
const ACTIVE_CASE_TURN = /\b(yes|confirm|confirmed|waiting|next|step|status|progress|what now|what is needed|what's needed|do now)\b/i;

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
  const prepared = await Promise.all(
    selected.map(async (row) => {
      const projection = row.workflowRunId ? await deps.projection(row.workflowRunId).catch(() => null) : null;
      const digest = await digestCase(row, projection);
      return { row, projection, digest };
    }),
  );
  const digests = prepared.map((item) => item.digest);
  emit({
    type: "stage",
    stage: { id: "cases", label: "Looked up your cases", state: "done", detail: `${digests.length} of ${rows.length} case${rows.length === 1 ? "" : "s"} match` },
  });
  const toolAnswer = unknown.length
    ? null
    : await answerWithCaseTools(
        message,
        prepared.map(({ row, projection, digest }) => ({ id: row.id, procedureId: row.procedureId, projection, digest })),
      );
  const answer: CasesAnswer = toolAnswer
    ? { question: message, cases: digests, unknown, answer: toolAnswer, by: "summary", model: null }
    : await answerAboutCases(message, digests, routed.caseIds.length ? "any" : routed.filter, deps.llm, unknown);
  emit({ type: "result", result: { kind: "cases", answer }, followUps: caseFollowUps(answer) });
}

/** How long moving the goods takes, from the published procedure and the
 *  route. Answers the question; opens nothing and asks nothing first. */
async function answerEstimate(message: string, draft: IntakeDraft, deps: ChatDeps, emit: (e: ChatEvent) => void): Promise<void> {
  emit({ type: "stage", stage: { id: "knowledge", label: "Finding the published procedure and the route", state: "running" } });
  const estimate = await estimateFor(message, draft);
  if (!estimate || !estimate.options.length) {
    emit({ type: "stage", stage: { id: "knowledge", label: "No published procedure fits these goods", state: "failed" } });
    await answerKnowledge(message, draft, deps, emit);
    return;
  }
  const [first] = estimate.options;
  emit({
    type: "stage",
    stage: {
      id: "knowledge",
      label: `Estimated from ${estimate.options.length === 1 ? `procedure ${first.procedureId}` : `${estimate.options.length} procedures`}${first.distanceKm ? ` and ~${first.distanceKm.toLocaleString("en-US")} km of route` : ""}`,
      state: "done",
    },
  });
  const start = first.direction === "export" ? "export" : "import";
  const route = estimate.from && estimate.to ? ` from ${estimate.from} to ${estimate.to}` : "";
  emit({
    type: "result",
    result: { kind: "estimate", estimate },
    followUps: [
      { label: "Plan this shipment", text: `I want to ${start} ${estimate.goods} by ${first.mode}${route}` },
      { label: "What documents will I need?", text: `What documents do I need to ${start} ${estimate.goods} by ${first.mode}?` },
    ],
  });
}

/** Wraps an emitter so every result is spoken before it is sent: the words
 *  first, then what the reply offers, then the result itself for the client's
 *  own bookkeeping. */
function speaking(emit: (e: ChatEvent) => void, presentation: ChatInput["presentation"]): (e: ChatEvent) => void {
  return (event) => {
    if (event.type !== "result") {
      emit(event);
      return;
    }
    // Short replies only when the caller explicitly renders the result cards.
    const spoken = presentation === "cards" ? brief(event.result) : say(event.result);
    for (const chunk of chunksOf(spoken.text)) emit({ type: "text", chunk });
    emit({ type: "actions", actions: spoken.actions });
    emit(event);
  };
}

export async function runChat(input: ChatInput, given: ChatDeps, rawEmit: (e: ChatEvent) => void): Promise<void> {
  // Every result is said in words before it is sent.
  const emit = speaking(rawEmit, input.presentation);
  const { draft, expecting } = input;
  // Misspelt goods, places and modes are put right before anything reads them.
  const read = correctTypos(input.message);
  const message = read.text;
  // Routing and the cases answer read the same list once.
  let listed: Promise<CaseRow[]> | null = null;
  const deps: ChatDeps = { ...given, listCases: () => (listed ??= given.listCases()) };
  try {
    emit({ type: "stage", stage: { id: "route", label: "Working out what you're asking", state: "running" } });
    if (read.fixes.length) {
      const fixed = read.fixes.map((f) => `“${f.from}” as “${f.to}”`).join(", ");
      emit({ type: "stage", stage: { id: "route", label: `Read ${fixed}`, state: "done" } });
    }
    let refs: { id: string; title: string; status: string }[] = [];
    try {
      refs = (await deps.listCases()).map((c) => ({ id: c.id, title: c.title, status: c.status }));
    } catch {
      refs = [];
    }
    let routed = await routeMessage(message, { draft, expecting, cases: refs }, deps.llm);
    if (
      input.caseId &&
      !routed.caseIds.length &&
      !message.match(new RegExp(CASE_REF.source, "i")) &&
      (routed.intent === "cases" || ACTIVE_CASE_TURN.test(message) || ACTIVE_CASE_TURN.test(input.message))
    ) {
      routed = { ...routed, intent: "cases", caseIds: [input.caseId.toUpperCase()], filter: "any", reasoning: `Using the active shipment in this chat: ${input.caseId}.` };
    }
    emit({ type: "stage", stage: { id: "route", label: INTENT_LABEL[routed.intent], state: "done", detail: routed.reasoning } });
    emit({ type: "route", routed });

    if (routed.intent === "estimate") {
      await answerEstimate(message, draft, deps, emit);
    } else if (routed.intent === "shipment") {
      if (input.caseId) {
        emit({ type: "result", result: { kind: "other", message: `This session is linked to case ${input.caseId}. Start a new shipment session to describe another shipment.`, suggestions: [] }, followUps: [] });
        emit({ type: "done" });
        return;
      }
      // Intention first: a question about timing is answered, not taken in.
      const goal = goalOf(message, draft, expecting);
      if (goal === "estimate") {
        await answerEstimate(message, draft, deps, emit);
        emit({ type: "done" });
        return;
      }
      emit({ type: "stage", stage: { id: "intake", label: "Reading the shipment details", state: "running" } });
      const turn = await intakeTurn(draft, message, expecting, deps.llm);
      if (turn.status === "declined") {
        emit({ type: "stage", stage: { id: "intake", label: "Not a shipment after all", state: "failed", detail: turn.message } });
        await answerKnowledge(message, draft, deps, emit);
      } else if (ESTIMATE_QUESTION.test(message) && turn.draft.commodity && !draft.commodity) {
        // The goods only became clear once intake read them ("taea by tarain"):
        // the question was still how long, so it still gets an estimate.
        emit({ type: "stage", stage: { id: "intake", label: `Read the goods as ${turn.draft.commodity.term}`, state: "done" } });
        await answerEstimate(message, turn.draft, deps, emit);
      } else {
        const label =
          turn.status === "confirm" ? "Every shipment detail checks out" : goal === "explore" ? "You're finding out, so nothing gets opened" : "Worked out what is still missing";
        emit({ type: "stage", stage: { id: "intake", label, state: "done" } });
        let needs: ShipmentNeeds | undefined;
        let overview: Overview | undefined;
        if (turn.status === "confirm" && turn.summary) {
          emit({ type: "stage", stage: { id: "knowledge", label: `Reading procedure ${turn.summary.procedureId}`, state: "running" } });
          needs = (await needsOf(turn.summary.procedureId, turn.draft)) ?? undefined;
          emit({
            type: "stage",
            stage: {
              id: "knowledge",
              label: `Listed what procedure ${turn.summary.procedureId} needs from you`,
              state: "done",
              detail: needs ? `${needs.documents.length} documents, ${needs.details.length} details` : undefined,
            },
          });
        } else if (goal === "explore" && turn.draft.commodity) {
          emit({ type: "stage", stage: { id: "knowledge", label: `Looking up the procedures for ${turn.draft.commodity.term}`, state: "running" } });
          overview = (await overviewFor(turn.draft, message)) ?? undefined;
          emit({
            type: "stage",
            stage: {
              id: "knowledge",
              label: overview ? `Found ${overview.options.length} published way${overview.options.length === 1 ? "" : "s"} to move ${overview.goods}` : "No published procedure fits yet",
              state: "done",
            },
          });
        }
        emit({ type: "result", result: { kind: "intake", turn, needs, overview }, followUps: turn.options.map((o) => ({ label: o.label, text: o.reply })) });
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
