"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { demoFor, demoForNeed } from "../../modules/demo/demo";
import type { AssistantView } from "../../modules/steps/assistant";
import type { UpfrontItem } from "../../modules/steps/upfront";
import type { DocumentRecord } from "../../modules/steps/ledger";
import type { Need, StepView } from "../../modules/steps/next";

type Act = (key: string, payload: Record<string, unknown>) => void;
type Upload = (need: Need, stepNum: number, file: File) => void;

const LANE_LABEL: Record<string, string> = { user: "You", agent: "Agent", physical: "At the goods" };
const MARK: Record<string, string> = { have: "✓", missing: "", review: "!", waiting: "…" };

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
        }
        else setError(body.error ?? "Could not load the case");
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
        <NextStep step={next} procedureId={view.procedureId} caseId={caseId} busy={busy} onAct={act} onUpload={upload} />
      ) : (
        <p className="needs-empty">Nothing is waiting on you — the agent is working.</p>
      )}

      {view.status !== "completed" ? (
        <Upfront view={view} caseId={caseId} busy={busy} onAct={act} onUpload={upload} />
      ) : null}

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

/* Before you start: everything that no earlier step produces and you already
 * hold. Given once at the start (step 0), it fills every later step that needs
 * it, so the agent runs those steps without stopping to ask. */
function Upfront({ view, caseId, busy, onAct, onUpload }: { view: AssistantView; caseId: string; busy: string | null; onAct: Act; onUpload: Upload }) {
  const { items, later } = view.upfront;
  if (!items.length) return null;
  const have = items.filter((i) => i.status === "have").length;
  const step = { stepNum: 0 } as StepView;
  return (
    <details className="assistant-upfront" open={have < items.length && view.kpis.completed < 3}>
      <summary>
        <strong>Before you start</strong> · {have}/{items.length} given upfront — fills later steps automatically
      </summary>
      <ul className="assistant-needs">
        {items.map((item) => (
          <NeedRow key={item.label} need={needOfUpfront(item)} step={step} procedureId={view.procedureId} caseId={caseId} busy={busy} onAct={onAct} onUpload={onUpload} />
        ))}
      </ul>
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

type RowProps = { step: StepView; procedureId: string; caseId: string; busy: string | null; onAct: Act; onUpload: Upload };

function NextStep({ step, procedureId, caseId, busy, onAct, onUpload }: RowProps) {
  const chosen = step.variants.find((v) => v.chosen);
  const rowProps = { step, procedureId, caseId, busy, onAct, onUpload };
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

      <ul className="assistant-needs">
        {step.needs.map((need) => (
          <NeedRow key={need.id} need={need} {...rowProps} />
        ))}
      </ul>

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
                disabled={Boolean(busy)}
                onClick={() => onAct(`variant:${step.stepNum}`, { action: "variant", stepNum: step.stepNum, label: "channel", value: v.label })}
              >
                {v.label}
              </button>
            ))}
          </div>
          {chosen ? (
            <ul className="assistant-needs">
              {chosen.needs.map((need) => (
                <NeedRow key={need.id} need={need} {...rowProps} />
              ))}
            </ul>
          ) : null}
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
              disabled={!step.ready || Boolean(busy)}
              onClick={() => onAct(`complete:${step.stepNum}`, { action: "complete", stepNum: step.stepNum })}
            >
              {busy === `complete:${step.stepNum}` ? "Completing…" : `Complete step ${step.stepNum}`}
            </button>
            {!step.ready ? <p className="needs-meta">Still needed: {step.blocking.join("; ")}</p> : null}
          </>
        )}
      </div>
    </article>
  );
}

function NeedRow({ need, step, procedureId, caseId, busy, onAct, onUpload }: RowProps & { need: Need }) {
  const [draft, setDraft] = useState(need.value ?? "");
  const uploading = busy === `upload:${need.id}`;
  // Once a document is uploaded the next move is confirming its fields, not uploading it again.
  const demo = need.status === "have" || need.document ? null : demoForNeed(procedureId, need, step.stepNum);

  const useDemoDocument = async () => {
    if (demo?.kind !== "document") return;
    const blob = await (await fetch(demo.url)).blob();
    onUpload(need, step.stepNum, new File([blob], demo.document.file, { type: blob.type || "image/png" }));
  };

  return (
    <li className="assistant-need" data-status={need.status} data-kind={need.kind}>
      <span className="assistant-need-mark" aria-label={need.status}>
        {MARK[need.status]}
      </span>
      <div className="assistant-need-body">
        <p>
          <strong>{need.label}</strong>
          {need.optional ? <em> · optional</em> : null}
          {need.output ? <em> · this step&rsquo;s output</em> : null}
        </p>
        <p className="needs-meta">{need.detail}</p>

        {need.kind === "value" ? (
          <form
            className="assistant-inline"
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.trim()) onAct(`value:${need.id}`, { action: "value", stepNum: step.stepNum, label: need.label, value: draft.trim() });
            }}
          >
            <input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label={need.label} placeholder={need.label} />
            <button type="submit" className="prompt" disabled={Boolean(busy) || !draft.trim()}>
              {need.status === "have" ? "Update" : "Save"}
            </button>
            {demo?.kind === "value" ? (
              <button
                type="button"
                className="prompt assistant-demo"
                disabled={Boolean(busy)}
                title={`Demo value: ${demo.value}`}
                onClick={() => {
                  setDraft(demo.value);
                  onAct(`value:${need.id}`, { action: "value", stepNum: step.stepNum, label: need.label, value: demo.value });
                }}
              >
                Use demo value
              </button>
            ) : null}
          </form>
        ) : null}

        {need.kind === "confirm" && need.status !== "have" ? (
          <button
            type="button"
            className="prompt"
            disabled={Boolean(busy)}
            onClick={() => onAct(`confirm:${need.id}`, { action: "confirm", stepNum: step.stepNum, label: need.label, value: "yes" })}
          >
            Confirm
          </button>
        ) : null}

        {need.kind === "document" && need.status !== "have" ? (
          <div className="assistant-inline">
            <label className="prompt assistant-upload" data-busy={uploading || undefined}>
              {uploading ? "Reading document…" : need.document ? "Upload again" : "Upload document"}
              <input
                type="file"
                accept="image/*,.pdf"
                disabled={Boolean(busy)}
                aria-label={`Upload ${need.label}`}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onUpload(need, step.stepNum, file);
                  event.target.value = "";
                }}
              />
            </label>
            {demo?.kind === "document" ? (
              <>
                <button type="button" className="prompt assistant-demo" disabled={Boolean(busy)} onClick={useDemoDocument} title={demo.document.title}>
                  Use demo document
                </button>
                <a className="needs-meta" href={demo.url} target="_blank" rel="noreferrer">
                  view demo
                </a>
              </>
            ) : null}
            {!need.docType && !need.document ? (
              <button
                type="button"
                className="prompt"
                disabled={Boolean(busy)}
                onClick={() => onAct(`confirm:${need.id}`, { action: "confirm", stepNum: step.stepNum, label: need.label, value: "provided" })}
              >
                Confirm provided
              </button>
            ) : null}
          </div>
        ) : null}
        {uploading ? <p className="needs-meta">OCR and the layout model are reading it — up to about a minute on this machine&rsquo;s CPU.</p> : null}
        {need.kind === "document" && need.document && need.status !== "have" ? (
          <DocumentReview doc={need.document} caseId={caseId} busy={busy} onAct={onAct} />
        ) : null}
      </div>
    </li>
  );
}

function DocumentReview({ doc, caseId, busy, onAct }: { doc: DocumentRecord; caseId: string; busy: string | null; onAct: Act }) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const key = `doc:${doc.docId}`;
  return (
    <div className="doc-review">
      <p className="needs-meta">
        {doc.fileName}
        {doc.r2Key ? (
          <>
            {" · "}
            <a href={`/api/cases/${caseId}/documents/${doc.docId}/file`} target="_blank" rel="noreferrer">
              open original
            </a>
          </>
        ) : null}
        {doc.pages ? ` · ${doc.pages} page${doc.pages > 1 ? "s" : ""}` : ""}
        {doc.timingsMs ? ` · read in ${(doc.timingsMs / 1000).toFixed(1)} s` : ""}
      </p>
      {doc.parseError ? <p className="assistant-paused">{doc.parseError} Fill in the fields below instead.</p> : null}
      {!doc.typeMatches && doc.detectedType ? (
        <p className="assistant-paused">This looks like a {doc.detectedType.replace(/_/g, " ")}. Upload the right document, or correct and confirm it.</p>
      ) : null}
      {doc.fields.length ? (
        <div className="doc-fields-wrap">
          <table className="doc-fields">
            <tbody>
              {doc.fields.map((f) => (
                <tr key={f.key} data-status={f.status}>
                  <th scope="row">
                    {f.label}
                    {f.required ? " *" : ""}
                  </th>
                  <td>
                    <input aria-label={f.label} defaultValue={f.value ?? ""} onChange={(event) => setEdits((prev) => ({ ...prev, [f.key]: event.target.value }))} />
                  </td>
                  <td>
                    <span className="doc-conf" data-status={f.status}>
                      {f.status === "confirmed" ? "confirmed" : f.value ? `${Math.round(f.confidence * 100)}% · ${f.status}` : "not found"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {doc.checks.length ? (
        <ul className="doc-checks">
          {doc.checks.map((c) => (
            <li key={c.check} data-status={c.status}>
              <strong>{c.check}:</strong> {c.detail}
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        className="prompt"
        disabled={Boolean(busy)}
        onClick={() => onAct(key, { action: "confirm-document", docId: doc.docId, corrections: edits, confirmAll: true })}
      >
        {busy === key ? "Saving…" : "Confirm fields"}
      </button>
    </div>
  );
}
