/* Questions about the trader's own cases: which are active, how far one has
 * got, what it is waiting on.
 *
 * Each case is reduced to a digest - status, stages done, the stages running
 * and the open steps with who they wait on - read from the case rows and its
 * workflow. The digest is intake data and published procedure steps, never
 * document contents, so a hosted model may read it. The model answers only
 * from the digests; an answer that states a number the digests don't contain
 * is dropped for the plain summary, which is always available. */

import { z } from "zod";
import { llmJson, type LlmClient } from "../ai/llm";
import { unsupportedClaims } from "../faq/answer";
import type { Lane } from "../procedures/delegation";
import { getProcedure } from "../procedures/registry";
import type { WorkflowProjection } from "../workflow/repository";
import { tailorProcedure } from "../workflow/tailor";
import type { CaseFilter, Routed } from "./router";
import { placesIn } from "../intake/shipment-plan";
import { inSentence } from "../shared/text";

export type OpenStep = { stepNum: number; title: string; lane: Lane; blockName: string };

export type CaseDigest = {
  id: string;
  title: string;
  /** "20 t · Tashkent → Almaty", when the shipment facts give one. */
  line: string;
  procedureId: string;
  status: string;
  stagesDone: number;
  stagesTotal: number;
  running: string[];
  openSteps: OpenStep[];
  updatedAt: string;
};

export type CasesAnswer = {
  question: string;
  cases: CaseDigest[];
  /** Cases the question named that don't exist. */
  unknown: string[];
  answer: string;
  by: "model" | "summary";
  model: string | null;
};

type CaseInput = {
  id: string;
  procedureId: string;
  title: string;
  query: string;
  status: string;
  shipmentFacts: string;
  updatedAt: string;
  blocks: { blockId: string; state: string }[];
};

const WAITS_ON: Record<Lane, string> = { user: "you", agent: "the agent", physical: "the goods (in person)" };

function facts(raw: string) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function digestCase(row: CaseInput, projection?: WorkflowProjection | null): Promise<CaseDigest> {
  const published = await getProcedure(row.procedureId);
  const tailored = published ? tailorProcedure(published, facts(row.shipmentFacts), row.query) : null;
  const blockName = (id: string) => published?.blocks.find((b) => b.id === id)?.name ?? id;
  const openSteps = (projection?.nodes ?? [])
    .filter((n) => n.state === "needs_input")
    .sort((a, b) => a.stepNum - b.stepNum)
    .map((n) => ({ stepNum: n.stepNum, title: n.title, lane: n.lane, blockName: n.blockName }));
  return {
    id: row.id,
    title: tailored?.title ?? row.title,
    line: tailored?.shipment.line ?? "",
    procedureId: row.procedureId,
    status: row.status,
    stagesDone: row.blocks.filter((b) => b.state === "done").length,
    stagesTotal: published?.blocks.length ?? row.blocks.length,
    running: row.blocks.filter((b) => b.state === "running").map((b) => blockName(b.blockId)),
    openSteps,
    updatedAt: row.updatedAt,
  };
}

const isComplete = (c: { status: string }) => c.status === "complete";

/** The cases a routed question is about: the ones it named, else the filter's. */
export function selectCases<T extends { id: string; status: string }>(all: T[], routed: Pick<Routed, "caseIds" | "filter">): T[] {
  if (routed.caseIds.length) return all.filter((c) => routed.caseIds.includes(c.id));
  const pick: Record<CaseFilter, (c: T) => boolean> = { active: (c) => !isComplete(c), complete: isComplete, any: () => true };
  return all.filter(pick[routed.filter]);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One line per case; `brief` keeps only progress and the first step waiting on
 *  the trader - for lists, where each case also shows as a card. */
export function describeCase(c: CaseDigest, brief = false): string {
  if (brief) {
    const onYou = c.openSteps.find((s) => s.lane === "user");
    return `${c.id} — ${c.title}: ${c.status}, ${c.stagesDone}/${c.stagesTotal} stages${onYou ? `, next on you: step ${onYou.stepNum} “${onYou.title}”` : ""}.`;
  }
  const parts = [`${c.id} — ${c.title}${c.line ? ` (${c.line})` : ""}: ${c.status}, ${c.stagesDone} of ${c.stagesTotal} stages done`];
  if (c.running.length) parts.push(`in progress: ${c.running.join(", ")}`);
  if (c.openSteps.length) {
    parts.push(`open steps: ${c.openSteps.slice(0, 4).map((s) => `step ${s.stepNum} “${s.title}” waits on ${WAITS_ON[s.lane]}`).join("; ")}`);
  }
  return `${parts.join("; ")}.`;
}

/** The answer without a model: what was selected, one line per case. */
export function summarize(cases: CaseDigest[], filter: CaseFilter, unknown: string[] = []): string {
  const missing = unknown.length ? `There is no case ${unknown.join(" or ")}. ` : "";
  if (!cases.length) {
    const none = filter === "active" ? "No active cases" : filter === "complete" ? "No finished cases" : "No cases";
    return `${missing}${none} yet — describe a shipment to open one.`;
  }

  /* One shipment: say where it stands and what it is waiting for. */
  if (cases.length === 1) return `${missing}${lineFor(cases[0])}`;

  /* Several: the count, then only the ones that need something from you.
     Listing every case as an id was the old answer, and it read as noise. */
  const kind = filter === "active" ? "active shipment" : filter === "complete" ? "finished shipment" : "shipment";
  const onYou = cases.filter((c) => c.openSteps.some((s) => s.lane === "user"));
  const head = `You have ${plural(cases.length, kind)}${onYou.length ? `, ${onYou.length} waiting on you` : ", none waiting on you"}.`;
  const lines = onYou.slice(0, 3).map((c) => `• ${lineFor(c)}`);
  const more = onYou.length > 3 ? `\n…and ${onYou.length - 3} more waiting on you.` : "";
  return `${missing}${head}${lines.length ? `\n\n${lines.join("\n")}${more}` : ""}`;
}

/** One shipment in a sentence: what it is, how far along, what it needs next.
 *  The route is worth carrying (two tea cases differ by where they go); the
 *  wagon count and HS heading are not, in a list. */
function lineFor(c: CaseDigest): string {
  const route = c.line.match(/([A-Z][\w' -]+ → [A-Z][\w' -]+)/)?.[1]?.trim();
  const what = `${c.title}${route ? `, ${route}` : ""} (${c.id})`;
  const progress = `${c.stagesDone} of ${c.stagesTotal} stages done`;
  const onYou = c.openSteps.find((s) => s.lane === "user");
  if (onYou) return `${what}: ${progress}. Next on you: ${inSentence(onYou.title)} (step ${onYou.stepNum}).`;
  const running = c.openSteps[0];
  if (running) return `${what}: ${progress}. Waiting on ${WAITS_ON[running.lane]} — ${inSentence(running.title)} (step ${running.stepNum}).`;
  return `${what}: ${progress}.`;
}

/** Places the answer names that no digest does. The gazetteer decides what
 *  counts as a place, so an ordinary capitalised word is not mistaken for one. */
export function inventedPlaces(answer: string, digests: string): string[] {
  const known = new Set(placesIn(digests).map((p) => p.place.name.toLowerCase()));
  return [...new Set(placesIn(answer).map((p) => p.place.name))].filter((name) => !known.has(name.toLowerCase()));
}

const Answered = z.object({ answer: z.string().min(1).max(2000) });

const SYSTEM = [
  "You are answering the trader themselves, in a chat, about their own shipments in UzTrade. Use ONLY the case digests given.",
  "Write to them: \"you\", not \"the trader\".",
  "Name a shipment by what it is - \"the tea to Moscow\", \"your carpets by train\" - and put the case id in brackets after it. A bare id means nothing to the person reading.",
  "Say what to do next in words: which document to get, who issues it, which shipment it is for. A step number on its own is not an answer; give the step's name if you give its number at all.",
  "Nothing is shown below your answer, so the answer has to stand on its own.",
  "With more than three shipments, lead with the count, then take the two or three that need something from them now, one short line each. Do not list ids that need nothing.",
  "Don't invent dates, durations, documents or steps that aren't in the digests. At most 5 sentences.",
  'Say "all" or "every" only when it holds for every digest; name the exceptions otherwise.',
  "If the digests don't answer the question, say what they do show.",
  'JSON: {"answer": "..."}',
].join("\n");

export async function answerAboutCases(question: string, cases: CaseDigest[], filter: CaseFilter, llm?: LlmClient, unknown: string[] = []): Promise<CasesAnswer> {
  const summary = summarize(cases, filter, unknown);
  const plain: CasesAnswer = { question, cases, unknown, answer: summary, by: "summary", model: null };
  if (!cases.length) return plain;

  // Hosted models have small per-minute token budgets: many cases go brief.
  const digests = cases.slice(0, 12).map((c) => describeCase(c, cases.length > 3));
  const reply = await llmJson(llm, {
    sensitivity: "public",
    system: SYSTEM,
    prompt: `Question: ${question}\n${unknown.length ? `These case ids don't exist: ${unknown.join(", ")}.\n` : ""}\nCases (${cases.length}):\n${digests.join("\n")}`,
    schema: Answered,
    maxTokens: 1500,
  });
  if (!reply) return plain;

  const answer = reply.data.answer.trim();
  const text = `${digests.join(" ")} ${unknown.join(" ")}`;
  const source = { id: "cases", title: `${cases.length} cases`, text, href: null };
  // Numbers and addresses the digests don't contain.
  if (unsupportedClaims(answer, [source]).length) return { ...plain, model: reply.model };
  // And places. Asked about several shipments at once, a model will carry one
  // shipment's destination across the rest - "the tea to Moscow" when the tea
  // goes to Almaty - which reads as fact and is not one.
  if (inventedPlaces(answer, text).length) return { ...plain, model: reply.model };
  return { ...plain, answer, by: "model", model: reply.model };
}
