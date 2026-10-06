/* Does the chat understand what the trader is asking?
 *
 * Each gold row is a message (and, for mid-conversation rows, the messages
 * before it) run through runChat exactly as the chat route runs it. What comes
 * back is graded on four things:
 *
 *   intent     estimate / shipment / knowledge / cases / other, as routed
 *   goal       for a shipment: explore (finding out) or start (intake proper)
 *   goods      the category, direction, mode, treatment and procedure the
 *              answer is about - read from the answer itself, not recomputed
 *   words      what the reply must say and must not say
 *
 * And on two rules that hold for every row whatever it expects:
 *
 *   - nothing opens a case. runChat is given no way to create one, and no
 *     reply may claim that one was opened;
 *   - a reply offers to open a case only when intake has every detail.
 *
 * Rows marked `needs: "model"` go to the model suite; the rest run on the
 * rules alone and must all pass.
 */
import { readFileSync } from "node:fs";
import { createLlmClient, type LlmClient } from "../../modules/ai/llm";
import { runChat, type ChatEvent, type ChatResult } from "../../modules/assistant/chat";
import { goalOf, type Goal } from "../../modules/assistant/intention";
import type { Intent } from "../../modules/assistant/router";
import { EMPTY_DRAFT, type IntakeDraft, type Slot } from "../../modules/intake/draft";
import { CATEGORIES } from "../../modules/intake/taxonomy";
import { CATALOGUE } from "../../modules/procedures/data/procedures.generated";
import type { CaseResult, RunOptions, Suite } from "../types";

export type QueryRow = {
  id: string;
  tags?: string[];
  needs?: "model";
  after?: string[];
  message: string;
  expect: {
    intent?: Intent;
    goal?: Goal;
    result?: ChatResult["kind"];
    overview?: boolean;
    category?: string;
    direction?: "export" | "import";
    mode?: "train" | "road" | "air";
    regime?: string;
    procedureId?: string;
    slot?: Slot;
    confirm?: boolean;
    optionsAtLeast?: number;
  };
  says?: string[];
  saysNot?: string[];
  why?: string;
};

export const readQueries = (): QueryRow[] =>
  (JSON.parse(readFileSync("evals/gold/queries.json", "utf8")) as { cases: QueryRow[] }).cases;

/** A row must describe what the corpus actually publishes. */
export function checkQueryGold(row: QueryRow): string | null {
  const e = row.expect;
  if (e.category && !CATEGORIES.includes(e.category)) return `no published category "${e.category}"`;
  if (!e.procedureId) return null;
  const p = CATALOGUE[e.procedureId];
  if (!p) return `procedure ${e.procedureId} is not published`;
  if (e.category && p.goods !== e.category) return `procedure ${e.procedureId} is ${p.goods}, gold says ${e.category}`;
  if (e.direction && p.direction !== e.direction) return `procedure ${e.procedureId} is ${p.direction}, gold says ${e.direction}`;
  if (e.mode && p.mode !== e.mode) return `procedure ${e.procedureId} is by ${p.mode}, gold says ${e.mode}`;
  if (e.regime && p.regime !== e.regime) return `procedure ${e.procedureId} is ${p.regime}, gold says ${e.regime}`;
  return null;
}

/** What one message did, read off the events the chat emitted. */
export type Observed = {
  intent: Intent | null;
  goal: Goal | null;
  result: ChatResult | null;
  text: string;
  confirm: boolean;
  draft: IntakeDraft;
  expecting: Slot | null;
};

const NO_CASES = { listCases: async () => [], projection: async () => null };

async function send(message: string, draft: IntakeDraft, expecting: Slot | null, llm: LlmClient | undefined): Promise<Observed> {
  const events: ChatEvent[] = [];
  await runChat({ message, draft, expecting }, { ...NO_CASES, llm }, (e) => events.push(e));
  const route = events.find((e) => e.type === "route");
  const intent = route?.type === "route" ? route.routed.intent : null;
  const resultEvent = events.find((e) => e.type === "result");
  const result = resultEvent?.type === "result" ? resultEvent.result : null;
  const actions = events.find((e) => e.type === "actions");
  const error = events.find((e) => e.type === "error");
  if (error?.type === "error") throw new Error(error.message);
  const turn = result?.kind === "intake" ? result.turn : null;
  return {
    intent,
    goal: intent === "shipment" ? goalOf(message, draft, expecting) : null,
    result,
    text: events.map((e) => (e.type === "text" ? e.chunk : "")).join(""),
    confirm: Boolean(actions?.type === "actions" && actions.actions.confirm),
    // The client carries the intake draft forward; anything else leaves it as it was.
    draft: turn ? turn.draft : draft,
    expecting: turn ? (turn.slot ?? null) : expecting,
  };
}

/** Walk the conversation the row describes; return what its last message did. */
export async function observe(row: QueryRow, llm?: LlmClient): Promise<Observed> {
  let draft = EMPTY_DRAFT;
  let expecting: Slot | null = null;
  for (const before of row.after ?? []) {
    const seen = await send(before, draft, expecting, llm);
    draft = seen.draft;
    expecting = seen.expecting;
  }
  return send(row.message, draft, expecting, llm);
}

/** The goods and procedure an answer is about, from the answer itself. */
function subjectOf(o: Observed) {
  const r = o.result;
  if (r?.kind === "estimate") {
    const first = r.estimate.options[0];
    return {
      category: r.estimate.category,
      direction: first?.direction,
      mode: first?.mode,
      regime: first ? CATALOGUE[first.procedureId]?.regime : undefined,
      procedureId: first?.procedureId,
      options: r.estimate.options.length,
    };
  }
  if (r?.kind === "intake") {
    const t = r.turn;
    const focus = r.overview?.focus;
    const id = t.summary?.procedureId ?? focus?.procedureId;
    return {
      category: t.draft.commodity?.category,
      direction: t.summary?.direction ?? focus?.direction ?? t.draft.statedDirection ?? undefined,
      mode: (t.summary ? CATALOGUE[t.summary.procedureId]?.mode : focus?.mode) ?? t.draft.mode ?? undefined,
      regime: id ? CATALOGUE[id]?.regime : undefined,
      procedureId: id,
      options: r.overview?.options.length ?? 0,
    };
  }
  return { category: undefined, direction: undefined, mode: undefined, regime: undefined, procedureId: undefined, options: 0 };
}

const OPENED = /\b(is open as case|case UZ-\d{4}-\d{4} is open|I(?:'ve| have) opened (?:the|a|your) case)\b/i;

/** Everything about the reply that does not match the row, plus the two rules. */
export function grade(row: QueryRow, o: Observed): string[] {
  const wrong: string[] = [];
  const e = row.expect;
  const s = subjectOf(o);
  const turn = o.result?.kind === "intake" ? o.result.turn : null;

  const check = (key: string, got: unknown, want: unknown) => {
    if (want !== undefined && got !== want) wrong.push(`${key} ${JSON.stringify(got ?? null)} ≠ ${JSON.stringify(want)}`);
  };
  check("intent", o.intent, e.intent);
  check("goal", o.goal, e.goal);
  check("result", o.result?.kind, e.result);
  check("category", s.category, e.category);
  check("direction", s.direction, e.direction);
  check("mode", s.mode, e.mode);
  check("regime", s.regime, e.regime);
  check("procedure", s.procedureId, e.procedureId);
  check("slot", turn?.slot, e.slot);
  check("confirm", o.confirm, e.confirm);
  if (e.overview !== undefined) check("overview", Boolean(o.result?.kind === "intake" && o.result.overview), e.overview);
  if (e.optionsAtLeast !== undefined && s.options < e.optionsAtLeast) wrong.push(`${s.options} options, need at least ${e.optionsAtLeast}`);

  for (const phrase of row.says ?? []) if (!o.text.toLowerCase().includes(phrase.toLowerCase())) wrong.push(`does not say "${phrase}"`);
  for (const phrase of row.saysNot ?? []) if (o.text.toLowerCase().includes(phrase.toLowerCase())) wrong.push(`says "${phrase}"`);

  // The rules every row is held to.
  if (OPENED.test(o.text)) wrong.push("claims a case was opened");
  if (o.confirm && turn?.status !== "confirm") wrong.push("offers to open a case before every detail is known");
  if (o.goal === "explore" && o.confirm) wrong.push("offers to open a case to someone finding out");
  if (o.result?.kind === "estimate" && o.confirm) wrong.push("an estimate offers to open a case");
  if (!o.text.trim()) wrong.push("says nothing");
  return wrong;
}

async function runRows(rows: QueryRow[], llm: LlmClient | undefined, options: RunOptions, pauseMs = 0): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const row of rows.slice(0, options.limit ?? rows.length)) {
    const bad = checkQueryGold(row);
    if (bad) {
      results.push({ id: row.id, ok: false, badGold: true, detail: bad });
      continue;
    }
    try {
      const seen = await observe(row, llm);
      const wrong = grade(row, seen);
      results.push({
        id: row.id,
        ok: wrong.length === 0,
        detail: wrong.length ? `${wrong.join("; ")}${options.verbose ? ` — "${seen.text.slice(0, 160).replace(/\s+/g, " ")}"` : ""}` : options.verbose ? row.message : undefined,
      });
    } catch (error) {
      results.push({ id: row.id, ok: false, detail: (error as Error).message.slice(0, 160) });
    }
    if (pauseMs) await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }
  return results;
}

export const understandingSuite: Suite = {
  name: "understanding",
  about: "Every kind of trader message, run through the chat: is the intent right, are the goods found, is an estimate answered, is finding out told apart from starting - and does nothing ever open a case.",
  async run(options) {
    // The rules alone: no model, so this is a gate, not a measurement.
    return runRows(readQueries().filter((r) => r.needs !== "model"), undefined, options);
  },
};

export const understandingModelSuite: Suite = {
  name: "understanding-model",
  about: "The same checks for the messages only a model can read: typos, other languages, loose phrasing - and the model router's own intent.",
  needsModel: true,
  threshold: 0.8,
  async run(options) {
    const llm = createLlmClient({ groqApiKey: process.env.GROQ_API_KEY!, groqModel: process.env.GROQ_MODEL });
    return runRows(
      readQueries().filter((r) => r.needs === "model"),
      llm,
      options,
      Number(process.env.EVAL_MODEL_PACE_MS ?? 2500),
    );
  },
};
