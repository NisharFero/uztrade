/* The work lists of the two analysis agents that sit below the workflow on a
 * case - Document Intelligence and Compliance & Risk.
 *
 * Both agents complete their own steps: nothing here waits on the trader to
 * click "confirm" or "mark supplied". A task is
 *   - pending  (unticked) - the step it depends on has not happened yet,
 *   - running  (spinner)  - the agent is working on it now,
 *   - done     (ticked)   - the agent has finished it.
 *
 * Pure functions over the case's state so the panels, the auto-verification
 * runner in case-board and the tests all agree on what each state means.
 */

import type { Procedure } from "../procedures/data/procedures.generated";
import { assessCompliance } from "../compliance/compliance";
import type { BlockState } from "../procedures/dag";
import { outputKey, requiredOutputsOf, type DocumentState, type RequiredOutput } from "./checklist";

export type TaskStatus = "pending" | "running" | "done";

export type AgentTask = {
  key: string;
  label: string;
  detail: string;
  status: TaskStatus;
  /** Short caption for the status: "Verified", "Verifying…", "Waiting on step 4". */
  note: string;
  severity?: "info" | "caution" | "high";
};

export type TaskGroup = {
  id: string;
  title: string;
  tasks: AgentTask[];
  /** Some step in the group is under way - the panel opens these by default. */
  active: boolean;
};

/** Where one procedure step stands in the live case. */
export type StepPhase = "waiting" | "active" | "completed" | "skipped";
export type StepPhaseOf = (blockId: string, stepNum: number) => StepPhase;

export const AUTO_VERIFIED_NOTE = "Auto-verified by Document Intelligence";

const NODE_PHASE: Record<string, StepPhase> = {
  waiting: "waiting",
  ready: "active",
  running: "active",
  needs_input: "active",
  failed: "active",
  completed: "completed",
  skipped: "skipped",
};

const BLOCK_PHASE: Record<BlockState, StepPhase> = {
  waiting: "waiting",
  blocked: "active",
  running: "active",
  done: "completed",
};

/** Step-level phase from the workflow engine's nodes when the case has a run,
 *  falling back to block-level progress otherwise. A block marked done wins
 *  over its nodes: completing a block from the drawer finishes every step in
 *  it even though the engine's nodes are not advanced by that path. */
export function stepPhaseResolver({
  blockStates = {},
  workflowNodes = [],
}: {
  blockStates?: Record<string, BlockState>;
  workflowNodes?: { blockId: string; stepNum: number; state: string }[];
}): StepPhaseOf {
  const nodes = new Map(workflowNodes.map((n) => [`${n.blockId}:${n.stepNum}`, n.state]));
  return (blockId, stepNum) => {
    const block = blockStates[blockId];
    if (block === "done") return "completed";
    const node = nodes.get(`${blockId}:${stepNum}`);
    if (node) return NODE_PHASE[node] ?? "waiting";
    return block ? BLOCK_PHASE[block] : "waiting";
  };
}

/* ------------------------- Document Intelligence ------------------------ */

const requiredOf = (procedure: Procedure) =>
  procedure.blocks.flatMap((b) => requiredOutputsOf(b).filter((r) => !r.optional));

/** Documents whose producing step has finished but which the agent has not
 *  yet verified - the auto-verification queue, in procedure order. */
export function dueOutputs(procedure: Procedure, documentState: DocumentState, phaseOf: StepPhaseOf): RequiredOutput[] {
  return requiredOf(procedure).filter(
    (r) => !documentState[outputKey(r.blockId, r.stepNum)]?.provided && phaseOf(r.blockId, r.stepNum) === "completed",
  );
}

function documentTask(r: RequiredOutput, documentState: DocumentState, phaseOf: StepPhaseOf, verifying: string | null): AgentTask {
  const key = outputKey(r.blockId, r.stepNum);
  const stored = documentState[key];
  const phase = phaseOf(r.blockId, r.stepNum);
  const base = { key, label: r.output, detail: `Step ${r.stepNum} · ${r.title}` };

  if (stored?.provided) {
    const note = !stored.note || stored.note === AUTO_VERIFIED_NOTE ? "Verified" : stored.note;
    return { ...base, status: "done", note };
  }
  if (verifying === key) return { ...base, status: "running", note: "Verifying…" };
  if (phase === "completed") return { ...base, status: "running", note: "Queued" };
  if (phase === "skipped") return { ...base, status: "pending", note: "Route not taken" };
  if (phase === "active") return { ...base, status: "pending", note: `Waiting on step ${r.stepNum}` };
  return { ...base, status: "pending", note: "Not started" };
}

/** Every required document, grouped by block, with the agent's status on each. */
export function documentTasks(
  procedure: Procedure,
  documentState: DocumentState,
  phaseOf: StepPhaseOf,
  verifying: string | null = null,
): TaskGroup[] {
  return procedure.blocks
    .map((block) => {
      const required = requiredOutputsOf(block).filter((r) => !r.optional);
      const tasks = required.map((r) => documentTask(r, documentState, phaseOf, verifying));
      const active =
        tasks.some((t) => t.status === "running") || block.steps.some((s) => phaseOf(block.id, s.num) === "active");
      return { id: block.id, title: block.name, tasks, active };
    })
    .filter((g) => g.tasks.length > 0);
}

/* ---------------------------- Compliance & Risk -------------------------- */

/** Steps that file a customs declaration or pay a customs charge - the
 *  filings the agent checks the declared goods and classification against. */
const CUSTOMS_FILING = /^(create|submit)\b.*customs declaration|\bcustoms fee\b|\bdut(y|ies)\b/i;

/** The agent's work on a case: HS classification and risk screening
 *  run as soon as the case opens; each customs filing is checked while its
 *  step is under way and ticks when the step completes. With no case (the
 *  procedure template) every filing check is pending. */
export function complianceTasks(
  procedure: Procedure,
  phaseOf?: StepPhaseOf,
  facts?: Parameters<typeof assessCompliance>[1],
  query = "",
): AgentTask[] {
  const a = assessCompliance(procedure, facts, query);

  const analysis: AgentTask[] = [
    {
      key: "hs",
      label: `Classify goods — HS ${a.hsCode}`,
      detail: a.hsHeading,
      status: "done",
      note: "Suggested",
    },
    ...a.riskFlags.map<AgentTask>((f) => ({
      key: `risk:${f.label}`,
      label: f.label,
      detail: f.reason,
      status: "done",
      note: f.severity === "high" ? "High risk" : f.severity === "caution" ? "Caution" : "Noted",
      severity: f.severity,
    })),
  ];

  const filings = procedure.blocks.flatMap((block) =>
    block.steps
      .filter((s) => !s.optional && CUSTOMS_FILING.test(s.title))
      .map<AgentTask>((s) => {
        const phase = phaseOf ? phaseOf(block.id, s.num) : "waiting";
        const status: TaskStatus = phase === "completed" ? "done" : phase === "active" ? "running" : "pending";
        return {
          key: `filing:${block.id}:${s.num}`,
          label: `Check filing — ${s.title}`,
          detail: `Step ${s.num} · the declared goods and HS ${a.hsCode} are checked against the filing`,
          status,
          note: status === "done" ? "Checked" : status === "running" ? `Checking step ${s.num}` : `Runs at step ${s.num}`,
        };
      }),
  );

  return [...analysis, ...filings];
}

export function countDone(tasks: AgentTask[]): number {
  return tasks.filter((t) => t.status === "done").length;
}
