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
  const kind = filter === "active" ? "active case" : filter === "complete" ? "finished case" : "case";
  const onYou = cases.filter((c) => c.openSteps.some((s) => s.lane === "user"));
  const head = cases.length === 1 ? "" : `${plural(cases.length, kind)}${onYou.length ? `, ${onYou.length} waiting on you` : ""}. `;
  return `${missing}${head}${cases.map((c) => describeCase(c, cases.length > 3)).join(" ")}`;
}

const Answered = z.object({ answer: z.string().min(1).max(2000) });

const SYSTEM = [
  "You answer a trader's question about their own trade cases in UzTrade, using ONLY the case digests given.",
  "Name cases by their id (e.g. UZ-2609-0001). Say plainly what is waiting on the trader.",
  "Each case is already shown to the trader as a card below your answer, so with more than three cases answer the question in aggregate (counts, what they have in common, which need attention first) instead of listing every case.",
  "Don't invent dates, durations, documents or steps that aren't in the digests. At most 4 sentences.",
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
  const source = { id: "cases", title: `${cases.length} cases`, text: `${digests.join(" ")} ${unknown.join(" ")}`, href: null };
  if (unsupportedClaims(answer, [source]).length) return { ...plain, model: reply.model };
  return { ...plain, answer, by: "model", model: reply.model };
}
