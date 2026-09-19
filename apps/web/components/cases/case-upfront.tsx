"use client";

import { useState } from "react";
import NeedsForm, { type Act, type Upload } from "../chat/needs-form";
import type { AssistantView } from "../../modules/steps/assistant";
import type { UpfrontItem } from "../../modules/steps/upfront";
import type { Need } from "../../modules/steps/next";
import { labelKey } from "../../modules/steps/ledger";

/** Inputs given at the start of the case are recorded against step 0, so every
 *  later step that needs them finds them already there. */
const UPFRONT_STEP = 0;

/** An upfront item as the shared needs form takes it. */
function asNeed(item: UpfrontItem): Need {
  return {
    id: `${UPFRONT_STEP}:${labelKey(item.label)}`,
    label: item.label,
    kind: item.kind,
    status: item.status,
    optional: false,
    detail: `${item.reason} — used at step${item.steps.length > 1 ? "s" : ""} ${item.steps.slice(0, 6).join(", ")}${item.steps.length > 6 ? "…" : ""}`,
    docType: item.docType,
    requiredFields: [],
    document: item.document,
    producedBy: null,
    value: item.value,
    autoFilled: false,
    output: false,
    form: item.form,
    notApplicable: false,
  };
}

/** Everything the case can be given before it starts: the documents you
 *  already hold and the details every application repeats. Folded until you
 *  open it; what has to wait is listed with the reason. */
export default function CaseUpfront({ caseId, procedureId }: { caseId: string; procedureId: string }) {
  const [view, setView] = useState<AssistantView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (view || loading) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/assistant`);
      const body = await response.json();
      if (!response.ok) setError(body.error ?? "Could not load what can be given upfront");
      else setView(body as AssistantView);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
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
      setView(body as AssistantView);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(null);
    }
  };

  const upload: Upload = async (need, _stepNum, file) => {
    setBusy(`upload:${need.id}`);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("stepNum", String(UPFRONT_STEP));
      form.append("label", need.label);
      const response = await fetch(`/api/cases/${caseId}/documents`, { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Upload failed");
        return;
      }
      setView(body.view as AssistantView);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(null);
    }
  };

  const items = view?.upfront.items ?? [];
  const have = items.filter((i) => i.status === "have").length;

  return (
    <details className="upfront" onToggle={(event) => event.currentTarget.open && void load()}>
      <summary>
        <span className="wf-detail-h">Give it upfront</span>
        <span className="ledger-count">
          {view ? `${have}/${items.length} provided · the rest fills every step that needs it` : loading ? "loading…" : "documents and details you can give before the steps"}
        </span>
      </summary>

      {error ? (
        <p className="query-note" data-tone="error">
          {error}
        </p>
      ) : null}

      {view ? (
        <>
          <NeedsForm
            needs={items.map(asNeed)}
            stepNum={UPFRONT_STEP}
            procedureId={procedureId}
            caseId={caseId}
            busy={busy}
            onAct={act}
            onUpload={upload}
          />

          {view.upfront.later.length ? (
            <div className="upfront-later">
              <p className="wf-detail-h">Has to wait</p>
              <ul>
                {view.upfront.later.map((l) => (
                  <li key={l.label}>
                    <strong>{l.label}</strong>
                    <small>
                      {l.reason} · step{l.steps.length > 1 ? "s" : ""} {l.steps.slice(0, 6).join(", ")}
                      {l.steps.length > 6 ? "…" : ""}
                    </small>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </details>
  );
}
