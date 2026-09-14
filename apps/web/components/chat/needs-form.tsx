"use client";

import { useState, type ReactNode } from "react";
import { demoForNeed } from "../../modules/demo/demo";
import type { DocumentRecord } from "../../modules/steps/ledger";
import type { Need } from "../../modules/steps/next";

export type Act = (key: string, payload: Record<string, unknown>) => Promise<void>;
export type Upload = (need: Need, stepNum: number, file: File) => Promise<void>;

type FormProps = {
  needs: Need[];
  /** 0 for "Before you start". */
  stepNum: number;
  procedureId: string;
  caseId: string;
  busy: string | null;
  onAct: Act;
  onUpload: Upload;
};
type RowProps = Omit<FormProps, "needs"> & { need: Need };

const MARK: Record<string, string> = { have: "✓", missing: "", review: "!", waiting: "…" };

const valuePayload = (stepNum: number, need: Need, value: string) => ({ action: "value", stepNum, label: need.label, value });

/** Everything a step (or the start of the case) needs, as one short form:
 *  values in a two-column grid that save when you leave the field, documents
 *  as one-line rows, confirmations as checkboxes, and what earlier steps or
 *  the entity already cover as a single line. Explanations sit in tooltips. */
export default function NeedsForm({ needs, stepNum, procedureId, caseId, busy, onAct, onUpload }: FormProps) {
  if (!needs.length) return null;
  const values = needs.filter((n) => n.kind === "value");
  const documents = needs.filter((n) => n.kind === "document");
  const confirms = needs.filter((n) => n.kind === "confirm");
  const covered = needs.filter((n) => n.kind === "earlier" || n.kind === "info");
  const row = { stepNum, procedureId, caseId, busy, onAct, onUpload };

  const demoValues = values.flatMap((need) => {
    if (need.status === "have") return [];
    const demo = demoForNeed(procedureId, need, stepNum);
    return demo?.kind === "value" ? [{ need, value: demo.value }] : [];
  });
  const fillDemoValues = async () => {
    for (const { need, value } of demoValues) await onAct(`value:${need.id}`, valuePayload(stepNum, need, value));
  };

  return (
    <div className="needs-form">
      {values.length ? (
        <Section
          title="Details"
          needs={values}
          action={
            demoValues.length ? (
              <button type="button" className="prompt prompt-sm assistant-demo" disabled={Boolean(busy)} onClick={fillDemoValues}>
                Fill demo values ({demoValues.length})
              </button>
            ) : null
          }
        >
          <div className="needs-grid">
            {values.map((need) => (
              // Keyed by the saved value so a server update refreshes the field.
              <ValueField key={`${need.id}:${need.value ?? ""}`} need={need} {...row} />
            ))}
          </div>
        </Section>
      ) : null}

      {documents.length ? (
        <Section title="Documents" needs={documents}>
          <ul className="nf-docs">
            {documents.map((need) => (
              <DocumentRow key={need.id} need={need} {...row} />
            ))}
          </ul>
        </Section>
      ) : null}

      {confirms.length ? (
        <Section title="Confirm" needs={confirms}>
          <ul className="nf-confirms">
            {confirms.map((need) => (
              <ConfirmRow key={need.id} need={need} {...row} />
            ))}
          </ul>
        </Section>
      ) : null}

      {covered.length ? (
        <Section title="Already covered" needs={covered}>
          <p className="needs-covered">
            {covered.map((need) => (
              <span key={need.id} className="needs-chip" data-status={need.status} title={need.detail}>
                {MARK[need.status] || "·"} {need.label}
              </span>
            ))}
          </p>
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, needs, action, children }: { title: string; needs: Need[]; action?: ReactNode; children: ReactNode }) {
  const done = needs.filter((n) => n.status === "have").length;
  return (
    <section className="needs-section" aria-label={title}>
      <div className="needs-section-head">
        <span>
          {title} <em>{done}/{needs.length}</em>
        </span>
        {action}
      </div>
      {children}
    </section>
  );
}

function Mark({ status }: { status: Need["status"] }) {
  return (
    <span className="needs-mark" data-status={status} aria-label={status}>
      {MARK[status]}
    </span>
  );
}

function ValueField({ need, stepNum, busy, onAct }: RowProps) {
  const key = `value:${need.id}`;
  const save = (raw: string) => {
    const value = raw.trim();
    if (value && value !== (need.value ?? "")) void onAct(key, valuePayload(stepNum, need, value));
  };
  return (
    <label className="needs-field" data-status={need.status} title={need.detail}>
      <span>
        <span className="needs-field-label">{need.label}</span>
        {need.optional ? <em>optional</em> : null}
        {busy === key ? <em>saving…</em> : need.status === "have" ? <b className="needs-tick">✓</b> : null}
      </span>
      <input
        defaultValue={need.value ?? ""}
        placeholder={need.optional ? "Optional" : "Required"}
        onBlur={(event) => save(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function DocumentRow({ need, stepNum, procedureId, caseId, busy, onAct, onUpload }: RowProps) {
  const [open, setOpen] = useState(false);
  const uploading = busy === `upload:${need.id}`;
  const doc = need.document;
  // Once a document is uploaded the next move is confirming its fields, not uploading a demo.
  const demo = need.status === "have" || doc ? null : demoForNeed(procedureId, need, stepNum);
  const toReview = doc ? doc.fields.filter((f) => f.required && f.status !== "accepted" && f.status !== "confirmed").length : 0;

  const upload = (file: File) => {
    setOpen(true); // show what was read as soon as it's back
    void onUpload(need, stepNum, file);
  };
  const useDemo = async () => {
    if (demo?.kind !== "document") return;
    const blob = await (await fetch(demo.url)).blob();
    upload(new File([blob], demo.document.file, { type: blob.type || "image/png" }));
  };

  const note = [need.optional ? "optional" : null, need.output ? "this step’s output" : null, doc ? doc.fileName : need.status === "have" ? need.detail : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="nf-doc" data-status={need.status}>
      <Mark status={need.status} />
      <span className="nf-doc-name" title={need.detail}>
        {need.label}
        {note ? <small>{note}</small> : null}
      </span>
      <span className="nf-doc-actions">
        {uploading ? (
          <em className="needs-meta">Reading… up to a minute</em>
        ) : (
          <>
            {doc && need.status !== "have" ? (
              <button type="button" className="prompt prompt-sm" data-tone="warn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                {open ? "Hide fields" : toReview ? `Review ${toReview} field${toReview > 1 ? "s" : ""}` : "Review fields"}
              </button>
            ) : null}
            {doc?.r2Key && need.status === "have" ? (
              <a className="needs-meta" href={`/api/cases/${caseId}/documents/${doc.docId}/file`} target="_blank" rel="noreferrer">
                view
              </a>
            ) : null}
            {need.status !== "have" ? (
              <label className="prompt prompt-sm assistant-upload">
                {doc ? "Replace" : "Upload"}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  disabled={Boolean(busy)}
                  aria-label={`Upload ${need.label}`}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) upload(file);
                    event.target.value = "";
                  }}
                />
              </label>
            ) : null}
            {demo?.kind === "document" ? (
              <button type="button" className="prompt prompt-sm assistant-demo" disabled={Boolean(busy)} onClick={useDemo} title={`Demo: ${demo.document.title}`}>
                Demo
              </button>
            ) : null}
            {!need.docType && !doc && need.status !== "have" ? (
              <button
                type="button"
                className="prompt prompt-sm"
                disabled={Boolean(busy)}
                onClick={() => void onAct(`confirm:${need.id}`, { action: "confirm", stepNum, label: need.label, value: "provided" })}
              >
                Mark provided
              </button>
            ) : null}
          </>
        )}
      </span>
      {doc && need.status !== "have" && open ? <DocumentReview doc={doc} caseId={caseId} busy={busy} onAct={onAct} /> : null}
    </li>
  );
}

function ConfirmRow({ need, stepNum, busy, onAct }: RowProps) {
  const have = need.status === "have";
  return (
    <li>
      <label className="nf-confirm" data-status={need.status}>
        <input
          type="checkbox"
          checked={have}
          disabled={have || Boolean(busy)}
          onChange={() => void onAct(`confirm:${need.id}`, { action: "confirm", stepNum, label: need.label, value: "yes" })}
        />
        <span>
          {need.label}
          {need.optional ? <em> · optional</em> : null}
        </span>
        <small>{need.detail}</small>
      </label>
    </li>
  );
}

function DocumentReview({ doc, caseId, busy, onAct }: { doc: DocumentRecord; caseId: string; busy: string | null; onAct: Act }) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const key = `doc:${doc.docId}`;
  return (
    <div className="doc-review">
      <p className="needs-meta">
        {doc.r2Key ? (
          <a href={`/api/cases/${caseId}/documents/${doc.docId}/file`} target="_blank" rel="noreferrer">
            open original
          </a>
        ) : (
          doc.fileName
        )}
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
        className="prompt prompt-sm"
        disabled={Boolean(busy)}
        onClick={() => void onAct(key, { action: "confirm-document", docId: doc.docId, corrections: edits, confirmAll: true })}
      >
        {busy === key ? "Saving…" : "Confirm fields"}
      </button>
    </div>
  );
}
