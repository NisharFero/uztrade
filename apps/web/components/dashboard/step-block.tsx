"use client";

import { Icon } from "../icons";
import NeedsForm, { type Act, type Upload } from "../chat/needs-form";
import type { AssistantView } from "../../modules/steps/assistant";
import { hours, LANE_LABEL, plural } from "./format";

/**
 * Block 2: the one step the case is on, read from the orchestrator. It asks
 * only for what that step needs; "Complete step" is offered once the step is
 * ready, and the orchestrator decides what comes next.
 */
export default function StepBlock({
  view,
  busy,
  problem,
  onAct,
  onUpload,
  onAsk,
}: {
  view: AssistantView;
  busy: string | null;
  /** What the orchestrator said was still missing when a completion was refused. */
  problem: string | null;
  onAct: Act;
  onUpload: Upload;
  onAsk: (question: string) => void;
}) {
  const k = view.kpis;
  const step = view.next;

  if (view.status === "completed" || !step) {
    return (
      <section className="block step-block" aria-label="Current step">
        <header className="block-head">
          <span className="block-icon">{Icon.check}</span>
          <div>
            <h2>{view.status === "completed" ? "Every step is done" : "Nothing to do right now"}</h2>
            <p>
              {k.completed} of {k.total} steps complete.
              {view.parallel.length ? ` ${plural(view.parallel.length, "step")} still running at the entities.` : ""}
            </p>
          </div>
        </header>
      </section>
    );
  }

  const agentFiling = step.lane === "agent" && !step.paused;
  const chosen = step.variants.find((v) => v.chosen);
  // The step's own output stays in: for a step the trader does, uploading the
  // result (the signed agreement, the certificate) is what completes it.
  const needs = [...step.needs, ...(chosen?.needs ?? [])];
  const act = (key: string, payload: Record<string, unknown>) => onAct(key, payload);

  return (
    <section className="block step-block" aria-labelledby="step-title">
      <div className="step-progress" aria-label={`${k.completed} of ${k.total} steps complete`}>
        <span style={{ width: `${k.percent}%` }} />
      </div>
      <header className="block-head">
        <span className="block-icon">{Icon.flow}</span>
        <div>
          <p className="block-kicker">
            Step {step.stepNum} of {k.total} · {step.blockName}
          </p>
          <h2 id="step-title">{step.title}</h2>
          <p className="step-meta">
            <span className="lane-tag" data-lane={step.lane}>
              {LANE_LABEL[step.lane] ?? step.lane}
            </span>
            {[step.entity, step.channel].filter(Boolean).join(" · ")}
          </p>
        </div>
      </header>

      {step.agentHelp ? <p className="step-help">{step.agentHelp}</p> : null}
      {step.notes.length ? (
        <ul className="step-notes">
          {step.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      {agentFiling ? (
        <div className="step-waiting">
          <p>
            The agent is filing this with <strong>{step.entity || "the entity"}</strong>
            {step.portal ? ` — ${step.portal.status}` : ""}. Nothing is needed from you.
          </p>
          <div className="block-actions">
            <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => void act("sync", { action: "sync" })}>
              {busy === "sync" ? "Checking…" : "Check with the entity"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {step.variants.length > 1 ? (
            <div className="step-variants" role="group" aria-label="Choose how to do this step">
              <span>Choose one:</span>
              {step.variants.map((v) => (
                <button
                  key={v.label}
                  type="button"
                  className="chip"
                  data-chosen={v.chosen || undefined}
                  aria-pressed={v.chosen}
                  disabled={Boolean(busy)}
                  onClick={() => void act(`variant:${v.label}`, { action: "variant", stepNum: step.stepNum, label: "variant", value: v.label })}
                >
                  {v.label}
                </button>
              ))}
            </div>
          ) : null}

          {needs.length ? (
            <NeedsForm needs={needs} stepNum={step.stepNum} procedureId={view.procedureId} caseId={view.caseId} busy={busy} onAct={onAct} onUpload={onUpload} />
          ) : (
            <p className="step-help">This step needs nothing from you but your go-ahead.</p>
          )}

          {problem ? <p className="block-error">{problem}</p> : null}

          <div className="block-actions">
            <button
              type="button"
              disabled={Boolean(busy) || !step.ready}
              onClick={() => void act("complete", { action: "complete", stepNum: step.stepNum })}
            >
              {busy === "complete" ? "Completing…" : "Complete step"}
            </button>
            <span className="block-hint">
              {step.ready ? "Everything this step needs is in." : step.blocking.length ? `Still needed: ${step.blocking.join(", ")}` : "Waiting on an earlier step."}
            </span>
            <button type="button" className="link" onClick={() => onAsk(`What do I need for step ${step.stepNum}, “${step.title}”, and why?`)}>
              Ask about this step
            </button>
          </div>
        </>
      )}

      <footer className="step-foot">
        <span>
          {k.completed} of {k.total} done · about {hours(k.etaHours)} to go
        </span>
        {view.parallel.length ? (
          <span>
            Also open:{" "}
            {view.parallel
              .slice(0, 3)
              .map((p) => `step ${p.stepNum} (${LANE_LABEL[p.lane] ?? p.lane}${p.paused ? ", paused" : ""})`)
              .join(", ")}
            {view.parallel.length > 3 ? ` and ${view.parallel.length - 3} more` : ""}
          </span>
        ) : null}
      </footer>
    </section>
  );
}
