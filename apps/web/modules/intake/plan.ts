/* The step plan intake hands back: not just WHICH procedure, but the steps to
 * follow - in dependency order, grouped into blocks that can run in parallel,
 * each step with who executes it, what that party does, and what it needs. */

import { ACTIONS, actionOfStep, delegationOfStep, type Lane, type StepAction } from "../procedures/delegation";
import type { Procedure, ProcedureBlock } from "../procedures/data/procedures.generated";
import { needsOfStep, type StepNeeds } from "../procedures/requirements";

export type PlanStep = {
  num: number;
  title: string;
  output: string;
  entity: string;
  channel: string;
  where: string;
  lane: Lane;
  laneReason: string;
  action: StepAction;
  actionLabel: string;
  optional: boolean;
  alternative: boolean;
  needs: StepNeeds;
};

export type PlanTrack = {
  blockId: string;
  name: string;
  dependsOn: string[];
  startsWhen: string;
  /** Blocks with no dependency either way - these can run at the same time. */
  parallelWith: string[];
  estHours: [number, number];
  steps: PlanStep[];
};

export type PlanDecision = { blockId: string; kind: "alternative" | "optional"; steps: number[] };

export type StepPlan = {
  procedureId: string;
  title: string;
  totalSteps: number;
  tracks: PlanTrack[];
  laneCounts: Record<Lane, number>;
  /** Blocks with no upstream dependency - work can start on all of them now. */
  startNow: string[];
  decisions: PlanDecision[];
  summary: string;
};

function ancestorsOf(blocks: ProcedureBlock[]): (id: string) => Set<string> {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const memo = new Map<string, Set<string>>();
  const walk = (id: string): Set<string> => {
    const cached = memo.get(id);
    if (cached) return cached;
    const found = new Set<string>();
    memo.set(id, found);
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      found.add(dep);
      for (const a of walk(dep)) found.add(a);
    }
    return found;
  };
  return walk;
}

export function buildStepPlan(procedure: Procedure): StepPlan {
  const blocks = [...procedure.blocks].sort((a, b) => a.level - b.level || a.stepRange[0] - b.stepRange[0]);
  const names = new Map(blocks.map((b) => [b.id, b.name]));
  const ancestors = ancestorsOf(blocks);
  const allSteps = procedure.blocks.flatMap((b) => b.steps).sort((a, b) => a.num - b.num);
  const laneCounts: Record<Lane, number> = { user: 0, agent: 0, physical: 0 };

  const tracks = blocks.map<PlanTrack>((block) => ({
    blockId: block.id,
    name: block.name,
    dependsOn: block.dependsOn,
    startsWhen: block.dependsOn.length
      ? `After ${block.dependsOn.map((d) => names.get(d) ?? d).join(" and ")}`
      : "Immediately — nothing upstream",
    parallelWith: blocks
      .filter((o) => o.id !== block.id && !ancestors(block.id).has(o.id) && !ancestors(o.id).has(block.id))
      .map((o) => o.id),
    estHours: block.estDuration,
    steps: [...block.steps]
      .sort((a, b) => a.num - b.num)
      .map((step) => {
        const delegation = delegationOfStep(step);
        const action = actionOfStep(step);
        laneCounts[delegation.lane]++;
        return {
          num: step.num,
          title: step.title,
          output: step.output,
          entity: step.entity,
          channel: step.channel,
          where: step.where,
          lane: delegation.lane,
          laneReason: delegation.reason,
          action,
          actionLabel: ACTIONS[action].label,
          optional: step.optional,
          alternative: step.alternative,
          needs: needsOfStep(step, allSteps.filter((s) => s.num < step.num)),
        };
      }),
  }));

  const decisions: PlanDecision[] = procedure.blocks.flatMap((b) => [
    ...(b.altSteps.length ? [{ blockId: b.id, kind: "alternative" as const, steps: b.altSteps }] : []),
    ...b.optionalSteps.map((n) => ({ blockId: b.id, kind: "optional" as const, steps: [n] })),
  ]);

  const startNow = tracks.filter((t) => !t.dependsOn.length).map((t) => t.blockId);
  const total = allSteps.length;

  return {
    procedureId: procedure.id,
    title: procedure.title,
    totalSteps: total,
    tracks,
    laneCounts,
    startNow,
    decisions,
    summary:
      `${total} steps in ${tracks.length} blocks; ${startNow.length} can start now. ` +
      `${laneCounts.agent} run by the agent, ${laneCounts.user} need you, ${laneCounts.physical} need the goods.`,
  };
}
