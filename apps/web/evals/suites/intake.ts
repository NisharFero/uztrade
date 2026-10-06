/* What intake does with a trader's words, from the gold conversations.
 *
 * The deterministic cases run through the rules alone. Cases marked
 * `"needs": "model"` are run by the model suite instead, so this one stays a
 * pass/fail gate.
 */
import { readFileSync } from "node:fs";
import { converse, evaluate, type IntakeTurn } from "../../modules/intake/conversation";
import { EMPTY_DRAFT } from "../../modules/intake/draft";
import { CATALOGUE } from "../../modules/procedures/data/procedures.generated";
import type { CaseResult, Suite } from "../types";

export type GoldCase = {
  id: string;
  message: string;
  replies?: string[];
  needs?: "model";
  expect: Record<string, unknown>;
  expectNot?: Record<string, unknown>;
  why?: string;
};

export const readGold = (): GoldCase[] =>
  (JSON.parse(readFileSync("evals/gold/intake.json", "utf8")) as { cases: GoldCase[] }).cases;

/** The expectation must describe a procedure the corpus actually publishes. */
export function checkGold(c: GoldCase): string | null {
  const id = c.expect.procedureId as string | undefined;
  if (!id) return null;
  const row = CATALOGUE[id];
  if (!row) return `procedure ${id} is not published`;
  for (const [key, expected] of Object.entries(c.expect)) {
    if (!["direction", "mode", "category", "regime", "kind"].includes(key)) continue;
    const actual = key === "category" ? row.goods : (row as unknown as Record<string, unknown>)[key];
    if (actual !== expected) return `procedure ${id} is ${key} ${String(actual)}, gold says ${String(expected)}`;
  }
  return null;
}

/** Walk one gold conversation with whatever turn function is given. */
export async function walk(
  c: GoldCase,
  turn: (draft: IntakeTurn["draft"], message: string, expecting: string | null) => Promise<IntakeTurn>,
): Promise<IntakeTurn> {
  let current = await turn(EMPTY_DRAFT, c.message, null);
  for (const reply of c.replies ?? []) {
    current = await turn(current.draft, reply, current.slot ?? null);
  }
  return current;
}

/** Compare a turn against the gold expectations; returns what did not match. */
export function mismatches(c: GoldCase, turn: IntakeTurn): string[] {
  const summary = turn.summary;
  const draft = turn.draft;
  const got: Record<string, unknown> = {
    status: turn.status,
    slot: turn.slot,
    procedureId: summary?.procedureId,
    caseTitle: summary?.caseTitle,
    direction: summary?.direction ?? draft.statedDirection,
    regime: summary?.regime ?? draft.regime,
    mode: draft.mode,
    category: draft.commodity?.category,
    term: draft.commodity?.term,
    kind: summary ? CATALOGUE[summary.procedureId]?.kind : undefined,
    proposalCategory: draft.proposal?.category,
    proposalTerm: draft.proposal?.term,
  };

  const wrong: string[] = [];
  for (const [key, expected] of Object.entries(c.expect)) {
    if (key === "messageMatches") {
      if (!new RegExp(String(expected), "i").test(turn.message)) wrong.push(`message "${turn.message.slice(0, 70)}" lacks /${expected}/`);
      continue;
    }
    if (got[key] !== expected) wrong.push(`${key} ${JSON.stringify(got[key])} ≠ ${JSON.stringify(expected)}`);
  }
  for (const [key, forbidden] of Object.entries(c.expectNot ?? {})) {
    if (got[key] === forbidden) wrong.push(`${key} must not be ${JSON.stringify(forbidden)}`);
  }
  return wrong;
}

export const intakeSuite: Suite = {
  name: "intake",
  about: "Gold conversations through the rules: the right procedure, the right treatment, and the questions asked in the right places.",
  async run(): Promise<CaseResult[]> {
    const results: CaseResult[] = [];
    for (const c of readGold().filter((g) => g.needs !== "model")) {
      const bad = checkGold(c);
      if (bad) {
        results.push({ id: c.id, ok: false, badGold: true, detail: bad });
        continue;
      }
      const turn = await walk(c, async (draft, message, expecting) =>
        draft === EMPTY_DRAFT && !message ? evaluate(draft) : converse(draft, message, { expecting: expecting as never }),
      );
      const wrong = mismatches(c, turn);
      results.push({ id: c.id, ok: !wrong.length, detail: wrong.join("; ") });
    }
    return results;
  },
};
