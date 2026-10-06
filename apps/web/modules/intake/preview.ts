/* What the intake block shows before a case exists.
 *
 * The block sends the shipment as fields (or one line of free text), and gets
 * back everything it needs to say "I matched this to Export of tea by train,
 * procedure 868": the intake turn (what is still missing, or the choices to
 * make), the matched procedure with its stages, how long it takes - published,
 * with the agents, and door to door on the route - and what it will ask for.
 *
 * Nothing here opens a case. That is POST /api/intake with confirm, which the
 * block's "Start case" button sends with the draft this returns.
 */

import type { LlmClient } from "../ai/llm";
import { estimateFor, needsOf, type Estimate, type EstimateOption, type ShipmentNeeds } from "../assistant/intention";
import { CATALOGUE } from "../procedures/data/procedures.generated";
import type { IntakeTurn } from "./conversation";
import { EMPTY_DRAFT, type IntakeDraft, type Slot } from "./draft";
import { intakeTurn } from "./turn";
import { correctTypos } from "./typos";

export type MatchedProcedure = {
  id: string;
  title: string;
  direction: string;
  mode: string;
  stages: number;
  steps: number;
  online: number;
  published: [number, number];
};

export type IntakePreview = {
  turn: IntakeTurn;
  /** The procedure intake settled on, once every detail holds. */
  procedure: MatchedProcedure | null;
  /** How long it takes: the matched procedure's option first, when there is one. */
  timing: EstimateOption | null;
  estimate: Estimate | null;
  needs: ShipmentNeeds | null;
  /** Words the typo corrector put right ("taea" → "tea"). */
  fixes: { from: string; to: string }[];
};

/** One sentence from the fields, in the order the rules read best. */
export function shipmentSentence(fields: {
  direction?: string | null;
  goods?: string | null;
  quantity?: string | number | null;
  unit?: string | null;
  origin?: string | null;
  destination?: string | null;
  mode?: string | null;
}): string {
  const clean = (v: unknown) => (v == null ? "" : String(v).trim());
  const goods = clean(fields.goods);
  const amount = clean(fields.quantity) ? `${clean(fields.quantity)} ${clean(fields.unit) || "tonnes"} of ` : "";
  return [
    clean(fields.direction),
    goods ? `${amount}${goods}` : "",
    clean(fields.origin) ? `from ${clean(fields.origin)}` : "",
    clean(fields.destination) ? `to ${clean(fields.destination)}` : "",
    clean(fields.mode) ? `by ${clean(fields.mode)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export async function previewIntake(input: {
  message: string;
  draft?: IntakeDraft | null;
  expecting?: Slot | null;
  llm?: LlmClient;
}): Promise<IntakePreview> {
  const read = correctTypos(input.message);
  const turn = await intakeTurn(input.draft ?? EMPTY_DRAFT, read.text, input.expecting ?? null, input.llm);

  const summary = turn.status === "confirm" ? turn.summary : undefined;
  const row = summary ? CATALOGUE[summary.procedureId] : undefined;
  const procedure: MatchedProcedure | null = row
    ? {
        id: row.id,
        title: row.title,
        direction: row.direction,
        mode: row.mode,
        stages: row.blocksCount,
        steps: row.stepsCount,
        online: row.onlineCount,
        published: row.timeframe,
      }
    : null;

  // Timed from the draft intake settled, so the route and the load are the
  // trader's own; the matched procedure's line is the one that counts.
  const estimate = turn.draft.commodity ? await estimateFor("", turn.draft).catch(() => null) : null;
  const timing = (procedure && estimate?.options.find((o) => o.procedureId === procedure.id)) ?? null;
  const needs = procedure ? await needsOf(procedure.id, turn.draft) : null;

  return { turn, procedure, timing, estimate, needs, fixes: read.fixes };
}
