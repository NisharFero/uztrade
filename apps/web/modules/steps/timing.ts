/* How long the case has actually taken, and who it was waiting on.
 *
 * Built from the timestamps the repository stores on audit events - not from
 * estimates. Every span between two events on a step is attributed to whoever
 * the step was waiting for:
 *
 *   you      an agent step paused for inputs, or a step you complete
 *   entity   an application under review at an entity API
 *   goods    a step done at the goods (inspection, loading, handover)
 *   agent    the platform working
 *
 * Steps run in parallel, so the shares add up to more than the elapsed time -
 * `sumMinutes` is the total attention spent, `elapsedMinutes` the clock. Runs
 * with no timestamps report `measured: false` and claim nothing. */

import type { AuditEventRecord, WorkflowProjection } from "../workflow/repository";
import { laneWaitingOn, type WaitingOn } from "./waiting";

export type WaitedOn = WaitingOn;
export const WAITED_ON: WaitedOn[] = ["you", "entity", "goods", "agent"];

export type StepTiming = {
  stepNum: number;
  title: string;
  lane: string;
  openedAt: string;
  closedAt: string | null;
  /** Who it is waiting on now; null once it is done. */
  waitingOn: WaitedOn | null;
  minutes: number;
  waited: Record<WaitedOn, number>;
  /** How often it went round again: a pause, a refusal, a change request. */
  cycles: number;
};

export type CaseTiming = {
  measured: boolean;
  startedAt: string | null;
  /** Wall clock from the first event to the last one (or to now, while the case is open). */
  elapsedMinutes: number;
  /** Time attributed across steps; more than the elapsed time when steps overlap. */
  sumMinutes: number;
  waited: Record<WaitedOn, number>;
  steps: StepTiming[];
  openNow: { stepNum: number; title: string; waitingOn: WaitedOn; minutes: number }[];
  slowest: StepTiming[];
  rework: { stepNum: number; title: string; cycles: number }[];
};

const MINUTE = 60_000;
const time = (value?: string) => (value ? Date.parse(value) : Number.NaN);
const zero = (): Record<WaitedOn, number> => ({ you: 0, entity: 0, goods: 0, agent: 0 });
const CLOSING = new Set(["agent_node_completed", "work_item_completed", "optional_node_skipped"]);

const laneWait = (lane: string): WaitedOn => laneWaitingOn(lane);

export function caseTiming(projection: WorkflowProjection, now = new Date()): CaseTiming {
  const empty: CaseTiming = { measured: false, startedAt: null, elapsedMinutes: 0, sumMinutes: 0, waited: zero(), steps: [], openNow: [], slowest: [], rework: [] };
  const nodes = new Map(projection.nodes.map((n) => [n.id, n]));
  const events = projection.auditEvents.filter((e) => e.nodeId && Number.isFinite(time(e.at))).sort((a, b) => time(a.at) - time(b.at));
  if (!events.length) return empty;

  const byNode = new Map<string, AuditEventRecord[]>();
  for (const event of events) {
    const list = byNode.get(event.nodeId!) ?? [];
    list.push(event);
    byNode.set(event.nodeId!, list);
  }

  const steps: StepTiming[] = [];
  for (const [nodeId, list] of byNode) {
    const node = nodes.get(nodeId);
    if (!node) continue;
    const waited = zero();
    let cycles = 0;
    let since = time(list[0].at);
    let kind = laneWait(node.lane);
    let closedAt: string | null = null;
    const move = (to: WaitedOn, moment: number) => {
      waited[kind] += Math.max(0, moment - since) / MINUTE;
      since = moment;
      kind = to;
    };

    for (const event of list) {
      const moment = time(event.at);
      switch (event.eventType) {
        case "work_item_created":
          move(laneWait(node.lane), moment);
          break;
        case "agent_paused":
          move("you", moment);
          cycles++;
          break;
        case "agent_resumed":
        case "portal_approved":
          move("agent", moment);
          break;
        case "portal_under_review":
          move("entity", moment);
          break;
        case "portal_rejected":
        case "portal_changes_requested":
          move("you", moment);
          cycles++;
          break;
        default:
          if (CLOSING.has(event.eventType)) {
            move(kind, moment);
            closedAt = event.at ?? null;
          }
      }
    }
    if (!closedAt) move(kind, now.getTime());

    const rounded = zero();
    for (const key of WAITED_ON) rounded[key] = Math.round(waited[key]);
    steps.push({
      stepNum: node.stepNum,
      title: node.title,
      lane: node.lane,
      openedAt: list[0].at!,
      closedAt,
      waitingOn: closedAt ? null : kind,
      minutes: Math.round(WAITED_ON.reduce((n, key) => n + waited[key], 0)),
      waited: rounded,
      cycles,
    });
  }

  steps.sort((a, b) => a.stepNum - b.stepNum);
  const waited = zero();
  for (const step of steps) for (const key of WAITED_ON) waited[key] += step.waited[key];
  const open = steps.filter((s) => !s.closedAt);
  const lastClose = Math.max(0, ...steps.map((s) => (s.closedAt ? time(s.closedAt) : 0)));
  const startedAt = time(events[0].at);

  return {
    measured: true,
    startedAt: new Date(startedAt).toISOString(),
    elapsedMinutes: Math.round(((open.length ? now.getTime() : lastClose) - startedAt) / MINUTE),
    sumMinutes: WAITED_ON.reduce((n, key) => n + waited[key], 0),
    waited,
    steps,
    openNow: open.map((s) => ({ stepNum: s.stepNum, title: s.title, waitingOn: s.waitingOn!, minutes: s.minutes })),
    slowest: [...steps].sort((a, b) => b.minutes - a.minutes).slice(0, 3),
    rework: steps.filter((s) => s.cycles > 0).map((s) => ({ stepNum: s.stepNum, title: s.title, cycles: s.cycles })),
  };
}
