"use client";

import { useMemo } from "react";
import { Icon } from "../icons";
import type { Procedure } from "../data/procedures.generated";
import { countDone, documentTasks, type StepPhaseOf } from "../lib/agent-tasks";
import type { DocumentState } from "../lib/document-intelligence";
import { collectOnce, procedureNeeds, waitingOn } from "../lib/requirements";
import { groupStatus, TaskList, TaskMark } from "./agent-task-list";
import { StepNeedsList } from "./step-needs";

/** Document Intelligence agent surface.
 *
 *  First, what the steps under way NEED - as points, grouped by source
 *  (earlier step, shipment documents, company profile, credentials,
 *  presence), each document expandable to the fields it must contain and the
 *  checks the agent runs. Then every document the procedure produces, with
 *  the agent's own verification status. This app has no file storage, so
 *  "verified" means the declared output was checked off against the completed
 *  step rather than read from an uploaded file. */
export default function DocumentPanel({
  procedure,
  documentState,
  phaseOf,
  verifying,
}: {
  procedure: Procedure;
  documentState: DocumentState;
  phaseOf: StepPhaseOf;
  /** Output key the agent is verifying right now, if any. */
  verifying: string | null;
}) {
  const groups = useMemo(
    () => documentTasks(procedure, documentState, phaseOf, verifying),
    [procedure, documentState, phaseOf, verifying],
  );
  const all = groups.flatMap((g) => g.tasks);
  const done = countDone(all);
  const running = all.filter((t) => t.status === "running").length;

  const needs = useMemo(() => procedureNeeds(procedure), [procedure]);
  const once = useMemo(() => collectOnce(procedure), [procedure]);
  const blockOfStep = useMemo(
    () => new Map(procedure.blocks.flatMap((b) => b.steps.map((s) => [s.num, b.id] as const))),
    [procedure],
  );
  const phase = (stepNum: number) => phaseOf(blockOfStep.get(stepNum) ?? "", stepNum);
  const isCompleted = (stepNum: number) => phase(stepNum) === "completed";
  const active = needs.filter((n) => phase(n.stepNum) === "active").slice(0, 4);
  const reusedSteps = new Set(once.profile.flatMap((p) => p.steps)).size;

  return (
    <section className="doc-panel" aria-label="Document intelligence">
      <div className="section-head">
        <p>
          <span className="head-icon" data-tint="teal">
            {Icon.documents}
          </span>
          Document Intelligence
        </p>
        <h2>Document checks</h2>
      </div>

      <div className="needs-block">
        <span className="wf-detail-h">What the current steps need</span>
        {active.length ? (
          active.map((n, index) => {
            const waiting = waitingOn(n, isCompleted);
            return (
              <details key={n.stepNum} className="needs-step" open={index === 0}>
                <summary>
                  <span className="needs-step-num">Step {n.stepNum}</span>
                  <span className="needs-step-title">{n.title}</span>
                  {waiting.length ? (
                    <small className="needs-meta" data-waiting>
                      waiting on step {waiting.map((w) => w.producedBy!.stepNum).join(", ")}
                    </small>
                  ) : null}
                </summary>
                <StepNeedsList needs={n} isCompleted={isCompleted} />
              </details>
            );
          })
        ) : (
          <p className="needs-empty">No step is under way right now.</p>
        )}
        <p className="needs-once">
          Collected once, not per step: {once.profile.length} company-profile and credential items (reused across{" "}
          {reusedSteps} steps) · {once.case.length} shipment documents for this case.
        </p>
      </div>

      <div className="doc-summary">
        <div className="doc-bar">
          <span style={{ width: `${all.length ? (done / all.length) * 100 : 100}%` }} />
        </div>
        <span>
          {done}/{all.length} documents verified
          {running ? ` · ${running} in progress` : ""} · runs automatically as each step completes
        </span>
      </div>

      <div className="task-groups">
        {groups.map((g) => {
          const status = groupStatus(g.tasks);
          return (
            <details key={g.id} className="task-group" data-status={status} open={g.active}>
              <summary>
                <TaskMark status={status} />
                <span className="task-group-title">{g.title}</span>
                <span className="task-group-count">
                  {countDone(g.tasks)}/{g.tasks.length}
                </span>
              </summary>
              <TaskList tasks={g.tasks} />
            </details>
          );
        })}
      </div>
    </section>
  );
}
