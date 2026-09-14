/* Case KPIs shown above the next step.
 *
 * ETA is the remaining critical path through the published block estimates,
 * with partly finished blocks scaled by the share of their steps still open.
 * Time saved is an estimate from stated assumptions, and the formula travels
 * with the number so it is never presented as measured. */

import type { Procedure } from "../procedures/data/procedures.generated";
import { pathHours, type Hours } from "../intake/shipment-plan";
import type { WorkflowProjection } from "../workflow/repository";
import type { Ledger } from "./ledger";
import { stepViewFor } from "./next";

export const AGENT_STEP_MINUTES = 45;
export const AUTOFILL_MINUTES = 1;

export type Kpis = {
  total: number;
  completed: number;
  remaining: number;
  percent: number;
  agentDone: number;
  agentTotal: number;
  etaHours: Hours;
  etaDates: [string, string];
  autoFilled: number;
  timeSavedMinutes: number;
  timeSavedFormula: string;
};

const done = (state: string) => state === "completed" || state === "skipped";

export function computeKpis(procedure: Procedure, projection: WorkflowProjection, ledger: Ledger, now = new Date()): Kpis {
  const nodes = projection.nodes;
  const total = nodes.length;
  const completed = nodes.filter((n) => done(n.state)).length;
  const agentNodes = nodes.filter((n) => n.lane === "agent" && !n.optional);
  const agentDone = agentNodes.filter((n) => n.state === "completed").length;

  const durations = new Map<string, Hours>();
  for (const block of procedure.blocks) {
    const blockNodes = nodes.filter((n) => n.blockId === block.id);
    const open = blockNodes.filter((n) => !done(n.state)).length;
    const share = blockNodes.length ? open / blockNodes.length : 0;
    durations.set(block.id, [block.estDuration[0] * share, block.estDuration[1] * share]);
  }
  const eta = pathHours(procedure.blocks, durations);
  const etaHours: Hours = [Math.round(eta[0]), Math.round(eta[1])];
  const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();

  let autoFilled = 0;
  for (const node of nodes) {
    if (node.state !== "completed") continue;
    const view = stepViewFor(procedure, projection, ledger, node);
    const needs = [...view.needs, ...view.variants.filter((v) => v.chosen).flatMap((v) => v.needs)];
    autoFilled += needs.filter((n) => n.autoFilled).length;
  }

  return {
    total,
    completed,
    remaining: total - completed,
    percent: total ? Math.round((completed / total) * 100) : 100,
    agentDone,
    agentTotal: agentNodes.length,
    etaHours,
    etaDates: [at(etaHours[0]), at(etaHours[1])],
    autoFilled,
    timeSavedMinutes: agentDone * AGENT_STEP_MINUTES + autoFilled * AUTOFILL_MINUTES,
    timeSavedFormula: `${agentDone} agent steps × ${AGENT_STEP_MINUTES} min + ${autoFilled} auto-filled values × ${AUTOFILL_MINUTES} min (estimate)`,
  };
}
