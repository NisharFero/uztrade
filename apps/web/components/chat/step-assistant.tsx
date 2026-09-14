"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { demoFor } from "../../modules/demo/demo";
import type { AssistantView } from "../../modules/steps/assistant";
import type { Need, StepView } from "../../modules/steps/next";
import type { UpfrontItem } from "../../modules/steps/upfront";
import NeedsForm, { type Act, type Upload } from "./needs-form";

const LANE_LABEL: Record<string, string> = { user: "You", agent: "Agent", physical: "At the goods" };

function duration(hours: number): string {
  if (hours < 1) return "<1h";
  const d = Math.floor(hours / 24);
  const h = Math.round(hours - d * 24);
  return d ? (h ? `${d}d ${h}h` : `${d}d`) : `${h}h`;
}
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const saved = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`);

/** The case, one step at a time: KPIs, the next step, what it needs, and a
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
        <p className="needs-empty">{error ?? "Loading the next step…"}</p>
      </section>
    );
  }

  const { kpis, next } = view;
  const hasDemo = Boolean(demoFor(view.procedureId));
  const formProps = { procedureId: view.procedureId, caseId, busy, onAct: act, onUpload: upload };
  return (
    <section className="assistant" aria-label="Step assistant">
      <div className="assistant-head">
        <div>
          <p className="wf-detail-h">Step assistant · {view.caseId}</p>
          <h2>{view.title}</h2>
        </div>
        <div className="assistant-links">
          {hasDemo ? (
            <Link className="crumb" href={`/demo/${view.procedureId}`}>
              Demo documents
            </Link>
          ) : null}
          {compact ? (
            <Link className="crumb" href={`/cases/${view.caseId}`}>
              Full workflow in Cases &amp; Shipments →
            </Link>
          ) : null}
        </div>
      </div>

      <dl className="assistant-kpis">
        <div>
          <dt>Steps done</dt>
          <dd>
            {kpis.completed}/{kpis.total}
          </dd>
          <span className="doc-bar">
            <span style={{ width: `${kpis.percent}%` }} />
          </span>
        </div>
        <div>
          <dt>Done by agent</dt>
          <dd>
            {kpis.agentDone}/{kpis.agentTotal}
          </dd>
          <small>agent steps in this procedure</small>
        </div>
        <div>
          <dt>ETA</dt>
          <dd>
            {duration(kpis.etaHours[0])}–{duration(kpis.etaHours[1])}
          </dd>
          <small>
            by {day(kpis.etaDates[0])}–{day(kpis.etaDates[1])}
          </small>
        </div>
        <div title={kpis.timeSavedFormula}>
          <dt>Time saved</dt>
          <dd>{saved(kpis.timeSavedMinutes)}</dd>
          <small>{kpis.timeSavedFormula}</small>
        </div>
      </dl>

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

      {view.status !== "completed" ? <Upfront view={view} {...formProps} /> : null}

      {view.parallel.length ? (
        <p className="assistant-parallel">
          <strong>Also open:</strong>{" "}
          {view.parallel.map((p) => `step ${p.stepNum} — ${p.title}${p.paused ? " (agent paused)" : ""}`).join(" · ")}
        </p>
      ) : null}

      {view.recent.length ? (
        <ul className="assistant-feed" aria-label="Recent activity">
          {view.recent.map((item, index) => (
            <li key={`${index}-${item.text}`} data-actor={item.actor}>
              {item.text}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

type FormProps = { procedureId: string; caseId: string; busy: string | null; onAct: Act; onUpload: Upload };

function NextStep({ step, ...form }: FormProps & { step: StepView }) {
  const chosen = step.variants.find((v) => v.chosen);
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
        <p className="assistant-paused">Agent paused — it runs by itself as soon as the items below are provided.</p>
      ) : (
        <p className="assistant-help">{step.agentHelp}</p>
      )}

      <NeedsForm needs={step.needs} stepNum={step.stepNum} {...form} />

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

/* Before you start: everything that no earlier step produces and you already
 * hold. Given once at the start (step 0), it fills every later step that needs
 * it, so the agent runs those steps without stopping to ask. */
function Upfront({ view, ...form }: FormProps & { view: AssistantView }) {
  const { items, later } = view.upfront;
  if (!items.length) return null;
  const have = items.filter((i) => i.status === "have").length;
  // Values and documents are shared across the case, so anything the current
  // step already asks for is filled there - don't ask for it twice.
  const inStep = new Set([...(view.next?.needs ?? []), ...(view.next?.variants.flatMap((v) => v.needs) ?? [])].map((n) => n.label));
  const rest = items.filter((i) => !inStep.has(i.label));
  const skipped = items.length - rest.length;
  return (
    <details className="assistant-upfront" open={have < items.length && view.kpis.completed < 3}>
      <summary>
        <strong>Before you start</strong> · {have}/{items.length} given upfront — fills later steps automatically
        {skipped ? <span className="needs-meta"> · {skipped} of them in the current step above</span> : null}
      </summary>
      <NeedsForm needs={rest.map(needOfUpfront)} stepNum={0} {...form} />
      {later.length ? (
        <details className="assistant-later">
          <summary>Given at their step, and why ({later.length})</summary>
          <ul>
            {later.map((l) => (
              <li key={l.label}>
                <strong>{l.label}</strong> · step {l.steps.join(", ")} — {l.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </details>
  );
}

function needOfUpfront(item: UpfrontItem): Need {
  return {
    id: `0:${item.label}`,
    label: item.label,
    kind: item.kind,
    status: item.status,
    optional: false,
    detail: `${item.reason} · used at step${item.steps.length > 1 ? "s" : ""} ${item.steps.join(", ")}`,
    docType: item.docType,
    requiredFields: [],
    document: item.document,
    producedBy: null,
    value: item.value,
    autoFilled: false,
    output: false,
  };
}
