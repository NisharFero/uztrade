"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { demoFor } from "../../modules/demo/demo";
import type { AssistantView } from "../../modules/steps/assistant";
import type { Need, StepView } from "../../modules/steps/next";
import CaseNote from "./case-note";
import NeedsForm, { type Act, type Upload } from "./needs-form";

const LANE_LABEL: Record<string, string> = { user: "You", agent: "Agent", physical: "At the goods" };

/** The case, one step at a time: the next step, what it needs, and a
 *  way to provide each thing - upload, value, confirmation or channel choice.
 *  Used on the dashboard (compact, links to the case) and on the case page
 *  (refreshes the full workflow below it after every change). */
export default function StepAssistant({
  caseId,
  compact = false,
  onStatus,
}: {
  caseId: string;
  compact?: boolean;
  /** Told whether the case is still active, so the chat can allow a new one once it's complete. */
  onStatus?: (status: AssistantView["status"]) => void;
}) {
  const router = useRouter();
  const [view, setView] = useState<AssistantView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/cases/${caseId}/assistant`)
      .then(async (response) => {
        const body = await response.json();
        if (!live) return;
        if (response.ok) {
          setView(body);
          onStatus?.(body.status);
        } else setError(body.error ?? "Could not load the case");
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Network error"));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per case
  }, [caseId]);

  const apply = (next: AssistantView) => {
    setView(next);
    onStatus?.(next.status);
    if (!compact) router.refresh();
  };

  // While an entity reviews an application, ask it again every few seconds;
  // the view only changes when an entity has decided.
  const reviewing = Boolean(view?.portals?.some((p) => p.status === "under_review"));
  const portalsSeen = useRef("");
  const applyLatest = useRef(apply);
  useEffect(() => {
    portalsSeen.current = JSON.stringify(view?.portals ?? []);
    applyLatest.current = apply;
  });
  useEffect(() => {
    if (!reviewing) return;
    const timer = window.setInterval(async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(`/api/cases/${caseId}/assistant`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "sync" }),
        });
        if (!response.ok) return;
        const next = (await response.json()) as AssistantView;
        if (JSON.stringify(next.portals) !== portalsSeen.current) applyLatest.current(next);
      } catch {
        // the next tick tries again
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [reviewing, caseId]);

  const act: Act = async (key, payload) => {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(`/api/cases/${caseId}/assistant`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.missing ? `Still needed: ${body.missing.join("; ")}` : body.error ?? "Request failed");
        return;
      }
      apply(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(null);
    }
  };

  const upload: Upload = async (need, stepNum, file) => {
    setBusy(`upload:${need.id}`);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("stepNum", String(stepNum));
      form.append("label", need.label);
      const response = await fetch(`/api/cases/${caseId}/documents`, { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Upload failed");
        return;
      }
      apply(body.view);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(null);
    }
  };

  if (!view) {
    return (
      <section className="assistant" aria-label="Step assistant">
        {error ? (
          <p className="needs-empty">{error}</p>
        ) : (
          <div className="assistant-skeleton" aria-busy="true" aria-label="Loading the next step">
            <span />
            <span />
            <span />
          </div>
        )}
      </section>
    );
  }

  const { next } = view;
  const hasDemo = Boolean(demoFor(view.procedureId));
  const formProps = { procedureId: view.procedureId, caseId, busy, onAct: act, onUpload: upload };
  return (
    <section className="assistant" aria-label="Steps">
      <div className="assistant-head">
        <p className="wf-detail-h">Steps · {view.caseId}</p>
        <div className="assistant-links">
          {hasDemo ? (
            <Link className="crumb" href={`/demo/${view.procedureId}`}>
              Demo documents
            </Link>
          ) : null}
          {compact ? (
            <Link className="crumb" href={`/cases/${view.caseId}`}>
              Workflow →
            </Link>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="query-note" data-tone="error">
          {error}
        </p>
      ) : null}

      {view.status === "completed" ? (
        <p className="opened-note">Every step is complete — you can start a new case.</p>
      ) : next ? (
        <NextStep step={next} {...formProps} />
      ) : (
        <p className="needs-empty">Nothing is waiting on you — the agent is working.</p>
      )}

      {view.completed.length ? <CompletedSteps rows={view.completed} /> : null}

      {view.parallel.length ? (
        <p className="assistant-parallel">
          <strong>Also open:</strong>{" "}
          {view.parallel.map((p) => `step ${p.stepNum} — ${p.title}${p.paused ? " (agent paused)" : ""}`).join(" · ")}
        </p>
      ) : null}
    </section>
  );
}

type FormProps = { procedureId: string; caseId: string; busy: string | null; onAct: Act; onUpload: Upload };
export type PortalRow = AssistantView["portals"][number];

export const PORTAL_STATUS: Record<PortalRow["status"], string> = {
  rejected: "Not accepted",
  under_review: "Under review",
  changes_requested: "Changes requested",
  approved: "Approved",
};

function CompletedSteps({ rows }: { rows: AssistantView["completed"] }) {
  const recent = rows.slice(-6).reverse();
  return (
    <section className="completed-steps" aria-label="Completed step summary">
      <div className="completed-head">
        <span className="wf-detail-h">Completed steps</span>
        <small>{rows.length} done</small>
      </div>
      <div className="completed-list">
        {recent.map((row) => (
          <article key={row.stepNum} className="completed-row">
            <header>
              <strong>
                Step {row.stepNum} · {row.title}
              </strong>
            </header>
            <div className="completed-cols">
              <span>
                <em>Status</em>
                <b>{row.status}</b>
              </span>
              <span>
                <em>Time taken</em>
                <b>{row.timeTaken}</b>
              </span>
              <span>
                <em>Time saved</em>
                <b>{row.timeSaved}</b>
              </span>
            </div>
            {row.remarks ? <p>{row.remarks}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

/** What the entity said about this step's application. */
function PortalStatus({ portal }: { portal: PortalRow }) {
  return (
    <div className="portal-status" data-status={portal.status}>
      <p>
        <span className="portal-chip" data-status={portal.status}>
          {PORTAL_STATUS[portal.status]}
        </span>
        <strong>{portal.entityName}</strong> · {portal.serviceTitle}
        {portal.reference ? (
          <>
            {" "}
            · <code>{portal.reference}</code>
          </>
        ) : null}
        {portal.revision > 1 ? ` · revision ${portal.revision}` : ""}
      </p>
      {portal.status === "under_review" ? <p className="needs-meta">The agent checks back every few seconds — nothing to do.</p> : null}
    </div>
  );
}

function NextStep({ step, ...form }: FormProps & { step: StepView }) {
  const chosen = step.variants.find((v) => v.chosen);
  const sentBack = step.portal && (step.portal.status === "rejected" || step.portal.status === "changes_requested");
  return (
    <article className="assistant-step" data-lane={step.lane} aria-label={`Step ${step.stepNum}`}>
      <p className="assistant-step-meta">
        <span className="assistant-lane" data-lane={step.lane}>
          {LANE_LABEL[step.lane] ?? step.lane}
        </span>
        Step {step.stepNum} · {step.blockName}
      </p>
      <h3>{step.title}</h3>
      <p className="assistant-step-where">
        {step.actionLabel} · {step.entity}
        {step.where ? ` · ${step.where}` : ""}
        {step.output ? ` · produces: ${step.output}` : ""}
      </p>
      {step.paused ? (
        <p className="assistant-paused">
          {sentBack
            ? `Agent paused — ${step.portal!.entityName} ${step.portal!.status === "rejected" ? "did not accept the application" : "requested changes"}. Give what it asks for below and the agent files it again.`
            : "Agent paused — it runs by itself as soon as the items below are provided."}
        </p>
      ) : (
        <p className="assistant-help">{step.agentHelp}</p>
      )}
      {step.portal ? <PortalStatus portal={step.portal} /> : null}
      {step.notes.length ? (
        <ul className="assistant-notes" aria-label="For this shipment">
          {step.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}

      <NeedsForm needs={step.needs} stepNum={step.stepNum} {...form} />

      <CaseNote caseId={form.caseId} busy={form.busy} onAct={form.onAct} />

      {step.variants.length ? (
        <div className="assistant-variants">
          <p className="wf-detail-h">Choose how</p>
          <div className="query-clarify-options">
            {step.variants.map((v) => (
              <button
                key={v.label}
                type="button"
                className="prompt"
                data-chosen={v.chosen || undefined}
                disabled={Boolean(form.busy)}
                onClick={() => void form.onAct(`variant:${step.stepNum}`, { action: "variant", stepNum: step.stepNum, label: "channel", value: v.label })}
              >
                {v.label}
              </button>
            ))}
          </div>
          {chosen ? <NeedsForm needs={chosen.needs} stepNum={step.stepNum} {...form} /> : null}
        </div>
      ) : null}

      <div className="assistant-actions">
        {step.lane === "agent" ? (
          <p className="needs-meta">{step.ready ? "Everything is here — the agent is running this step." : `Waiting for: ${step.blocking.join("; ")}`}</p>
        ) : (
          <>
            <button
              type="button"
              className="intake-create"
              disabled={!step.ready || Boolean(form.busy)}
              onClick={() => void form.onAct(`complete:${step.stepNum}`, { action: "complete", stepNum: step.stepNum })}
            >
              {form.busy === `complete:${step.stepNum}` ? "Completing…" : `Complete step ${step.stepNum}`}
            </button>
            {!step.ready ? <p className="needs-meta">Still needed: {step.blocking.join("; ")}</p> : null}
          </>
        )}
      </div>
    </article>
  );
}
