/* What to start now, and what waiting costs.
 *
 * The published dependencies are between blocks, so the remaining clock is
 * computed over blocks (critical path method): a block's remaining hours are
 * its published estimate scaled by the share of its steps still open; its
 * earliest start is when the blocks it depends on finish; its tail is itself
 * plus the longest chain after it. The longest earliest-start-plus-tail is the
 * case's remaining clock, and a step's slack is how far below that its own
 * chain sits. Slack 0 means every hour it waits is an hour later for the whole
 * shipment; a block with slack can wait that long without costing anything.
 *
 * All of it is arithmetic over the published estimates and what the run has
 * completed - no model, and nothing is reordered behind your back: the long
 * pole is named so you can start it today. */

import type { Hours } from "../intake/shipment-plan";
import type { Procedure, ProcedureBlock } from "../procedures/data/procedures.generated";
import type { WorkflowNodeRecord, WorkflowProjection } from "../workflow/repository";
import { laneWaitingOn, type WaitingOn } from "./waiting";

export type ScheduleRow = {
  stepNum: number;
  title: string;
  blockName: string;
  lane: string;
  waitingOn: WaitingOn;
  /** Hours still to run in this step's block. */
  blockHours: Hours;
  /** This block plus the longest chain that follows it. */
  tailHours: number;
  slackHours: number;
  critical: boolean;
  why: string;
};

export type CaseSchedule = {
  /** The remaining critical path, low and high estimate. */
  remainingHours: Hours;
  /** Open steps someone can act on now, longest pole first. */
  startNow: ScheduleRow[];
  /** What comes up next, once what it waits for is done. */
  next: ScheduleRow[];
  /** The longest chain that hasn't started yet - worth starting today. */
  longPole: { blockName: string; hours: Hours; firstStep: number; started: boolean } | null;
  note: string;
};

const isDone = (state: string) => state === "completed" || state === "skipped";
const round = (n: number) => Math.round(n * 10) / 10;

/** Remaining hours per block: the published estimate scaled by the steps still open. */
function remaining(procedure: Procedure, nodes: WorkflowNodeRecord[]): Map<string, Hours> {
  const out = new Map<string, Hours>();
  for (const block of procedure.blocks) {
    const inBlock = nodes.filter((n) => n.blockId === block.id);
    const open = inBlock.filter((n) => !isDone(n.state)).length;
    const share = inBlock.length ? open / inBlock.length : 0;
    out.set(block.id, [block.estDuration[0] * share, block.estDuration[1] * share]);
  }
  return out;
}

export function caseSchedule(procedure: Procedure, projection: WorkflowProjection): CaseSchedule {
  const blocks = procedure.blocks;
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const rem = remaining(procedure, projection.nodes);
  const high = (id: string) => rem.get(id)?.[1] ?? 0;
  const low = (id: string) => rem.get(id)?.[0] ?? 0;

  // Earliest start (what it waits for) and tail (what waits for it), on the high estimate.
  const order = [...blocks].sort((a, b) => a.level - b.level);
  const start = new Map<string, number>();
  const startLow = new Map<string, number>();
  for (const block of order) {
    const ready = block.dependsOn.map((d) => (start.get(d) ?? 0) + high(d));
    const readyLow = block.dependsOn.map((d) => (startLow.get(d) ?? 0) + low(d));
    start.set(block.id, ready.length ? Math.max(...ready) : 0);
    startLow.set(block.id, readyLow.length ? Math.max(...readyLow) : 0);
  }
  const successors = new Map<string, string[]>();
  for (const block of blocks) for (const dep of block.dependsOn) successors.set(dep, [...(successors.get(dep) ?? []), block.id]);
  const tails = new Map<string, number>();
  const tail = (id: string): number => {
    const seen = tails.get(id);
    if (seen != null) return seen;
    const after = (successors.get(id) ?? []).map(tail);
    const value = high(id) + (after.length ? Math.max(...after) : 0);
    tails.set(id, value);
    return value;
  };
  for (const block of [...order].reverse()) tail(block.id);

  const finishes = blocks.map((b) => (start.get(b.id) ?? 0) + tail(b.id));
  const finishesLow = blocks.map((b) => (startLow.get(b.id) ?? 0) + low(b.id));
  const remainingHours: Hours = [round(Math.max(0, ...finishesLow)), round(Math.max(0, ...finishes))];
  const longest = Math.max(0, ...finishes);

  const open = projection.nodes.filter((n) => !isDone(n.state));
  const rowOf = (node: WorkflowNodeRecord, block: ProcedureBlock): ScheduleRow => {
    const chain = (start.get(block.id) ?? 0) + tail(block.id);
    const slack = round(Math.max(0, longest - chain));
    const blockHours: Hours = [round(low(block.id)), round(high(block.id))];
    return {
      stepNum: node.stepNum,
      title: node.title,
      blockName: block.name,
      lane: node.lane,
      waitingOn: laneWaitingOn(node.lane, node.state),
      blockHours,
      tailHours: round(tail(block.id)),
      slackHours: slack,
      critical: slack < 1,
      why:
        slack < 1
          ? `On the critical path — “${block.name}” and what follows it is ${round(tail(block.id))} h of the ${round(longest)} h left. Every hour here is an hour later.`
          : `Can wait about ${slack} h without delaying the shipment (“${block.name}” is off the critical path).`,
    };
  };

  const rows = open
    .filter((n) => n.state === "needs_input" || n.state === "ready" || n.state === "running")
    .map((n) => rowOf(n, byId.get(n.blockId)!))
    .sort((a, b) => a.slackHours - b.slackHours || a.stepNum - b.stepNum);

  const waiting = open
    .filter((n) => n.state === "waiting")
    .map((n) => rowOf(n, byId.get(n.blockId)!))
    .sort((a, b) => a.slackHours - b.slackHours || a.stepNum - b.stepNum)
    .slice(0, 3);

  // The longest chain nobody has touched yet.
  const untouched = blocks
    .filter((b) => projection.nodes.some((n) => n.blockId === b.id && !isDone(n.state)))
    .map((b) => ({ block: b, chain: (start.get(b.id) ?? 0) + tail(b.id), started: projection.nodes.some((n) => n.blockId === b.id && isDone(n.state)) }))
    .sort((a, b) => b.chain - a.chain)[0];
  const longPole = untouched
    ? {
        blockName: untouched.block.name,
        hours: [round(low(untouched.block.id)), round(high(untouched.block.id))] as Hours,
        firstStep: Math.min(...projection.nodes.filter((n) => n.blockId === untouched.block.id && !isDone(n.state)).map((n) => n.stepNum)),
        started: untouched.started,
      }
    : null;

  const critical = rows.filter((r) => r.critical).length;
  return {
    remainingHours,
    startNow: rows,
    next: waiting,
    longPole,
    note: rows.length
      ? `${critical} of ${rows.length} open step${rows.length === 1 ? "" : "s"} ${critical === 1 ? "is" : "are"} on the critical path; the rest have slack.`
      : "Nothing is open — the agent is working or the case is done.",
  };
}
