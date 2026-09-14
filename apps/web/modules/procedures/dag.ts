/* Graph maths over a procedure's blocks.
 *
 * Durations here are HOURS (block estDuration is [minH, maxH]), unlike the
 * earlier demo model which worked in minutes.
 */

import type { Procedure, ProcedureBlock } from "./data/procedures.generated";
import { blockColumn, delegationOfStep } from "./delegation";

export type BlockState = "waiting" | "blocked" | "running" | "done";

/** Longest path from a root, in hops. Becomes the diagram row, so blocks that
 *  share a level are genuinely concurrent. The source data ships `level`
 *  already; this recomputes it so the layout never trusts a stale field. */
export function levelsOf(blocks: ProcedureBlock[]): Map<string, number> {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const out = new Map<string, number>();

  const walk = (id: string, seen: Set<string>): number => {
    const cached = out.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0; // cycle guard; the graph is a DAG by contract
    seen.add(id);
    const b = byId.get(id);
    const level = !b?.dependsOn.length ? 0 : Math.max(...b.dependsOn.map((d) => walk(d, seen))) + 1;
    out.set(id, level);
    return level;
  };

  for (const b of blocks) walk(b.id, new Set());
  return out;
}

/** Weight used for the critical path: the pessimistic end of the published
 *  range, since that is what a shipper plans against. */
const weight = (b: ProcedureBlock) => b.estDuration[1];

/** Longest path measured in hours - the chain that sets the delivery date.
 *  Work off this path has slack and is not what to expedite. */
export function criticalPath(blocks: ProcedureBlock[]): Set<string> {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const cost = new Map<string, number>();
  const from = new Map<string, string | null>();

  const costOf = (id: string): number => {
    const cached = cost.get(id);
    if (cached !== undefined) return cached;
    const b = byId.get(id);
    if (!b) return 0;

    let best = 0;
    let bestDep: string | null = null;
    for (const d of b.dependsOn) {
      const c = costOf(d);
      if (c > best) {
        best = c;
        bestDep = d;
      }
    }
    cost.set(id, best + weight(b));
    from.set(id, bestDep);
    return best + weight(b);
  };

  for (const b of blocks) costOf(b.id);

  let tail = blocks[0]?.id ?? "";
  for (const b of blocks) if ((cost.get(b.id) ?? 0) > (cost.get(tail) ?? 0)) tail = b.id;

  const path = new Set<string>();
  for (let cur: string | null = tail; cur; cur = from.get(cur) ?? null) path.add(cur);
  return path;
}

/** Hours -> "6h" / "2d 4h". */
export function fmtHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "0h";
  if (h < 24) return `${Math.round(h)}h`;
  const days = Math.floor(h / 24);
  const rem = Math.round(h % 24);
  return rem ? `${days}d ${rem}h` : `${days}d`;
}

export function fmtRange(range: [number, number]): string {
  return range[0] === range[1] ? fmtHours(range[1]) : `${fmtHours(range[0])}–${fmtHours(range[1])}`;
}

/** Headline numbers for the KPI strip, all derived from the graph. */
export function procedureStats(procedure: Procedure) {
  const blocks = procedure.blocks;
  const path = criticalPath(blocks);
  const pathHours = blocks.filter((b) => path.has(b.id)).reduce((s, b) => s + weight(b), 0);
  const totalWork = blocks.reduce((s, b) => s + weight(b), 0);

  // A handoff is a dependency crossing from one lane to another - the point
  // control passes between the trader, the agent, and physical handling.
  const dominant = new Map(blocks.map((b) => [b.id, blockColumn(b)]));
  let handoffs = 0;
  for (const b of blocks)
    for (const d of b.dependsOn) if (dominant.get(d) !== dominant.get(b.id)) handoffs++;

  let online = 0;
  let inPerson = 0;
  for (const b of blocks)
    for (const s of b.steps) (/^online:/i.test(s.channel) ? online++ : inPerson++);

  const agentSteps = blocks.reduce(
    (n, b) => n + b.steps.filter((s) => delegationOfStep(s).lane === "agent").length,
    0,
  );

  const bottleneck = blocks
    .filter((b) => path.has(b.id))
    .reduce((a, b) => (weight(b) > weight(a) ? b : a), blocks[0]);

  return {
    path,
    pathHours,
    totalWork,
    handoffs,
    online,
    inPerson,
    agentSteps,
    automationPct: Math.round((agentSteps / procedure.stepsCount) * 100),
    bottleneck,
    bottleneckShare: pathHours ? Math.round((weight(bottleneck) / pathHours) * 100) : 0,
    entities: new Set(blocks.flatMap((b) => b.entities)).size,
  };
}

/** Readiness rule: a block is runnable only when EVERY dependency is done.
 *  Produces sequential chains and parallel joins from the same statement. */
export function deriveStates(
  blocks: ProcedureBlock[],
  done: Set<string>,
): Map<string, BlockState> {
  const out = new Map<string, BlockState>();
  for (const b of blocks) {
    if (done.has(b.id)) out.set(b.id, "done");
    else if (b.dependsOn.every((d) => done.has(d))) out.set(b.id, "running");
    else out.set(b.id, "waiting");
  }
  return out;
}
