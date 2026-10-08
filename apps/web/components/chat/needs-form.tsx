"use client";

import { useState, type ReactNode } from "react";
import { demoForNeed } from "../../modules/demo/demo";
import { GATE, type ExtractedField } from "../../modules/documents/docai/compose";
import { describeEvidence } from "../../modules/documents/docai/evidence";
import { FIELD_OPTIONS } from "../../modules/documents/docai/validate";
import type { FormFieldView } from "../../modules/steps/application-forms";
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
  const covered = needs.filter((n) => (n.kind === "earlier" || n.kind === "info") && !n.notApplicable);
  const notNeeded = needs.filter((n) => n.notApplicable);
  const forms = needs.filter((n) => n.kind === "form" && n.form);
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

      {forms.map((need) => (
        <ApplicationForm key={need.id} need={need} {...row} />
      ))}

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
      {notNeeded.length ? (
        <section className="needs-section" aria-label="Not needed for this shipment">
          <div className="needs-section-head">
            <span>
              Not needed for this shipment <em>{notNeeded.length}</em>
            </span>
          </div>
          <p className="needs-covered">
            {notNeeded.map((need) => (
              <span key={need.id} className="needs-chip" data-status="skip" title={need.detail}>
                {need.label}
              </span>
            ))}
          </p>
        </section>
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

/* A portal application (e.g. the Single Window quarantine permit application):
 * each "Information about …" group with the fields the portal actually asks
 * for, pre-filled from the case where it can be. */
function ApplicationForm({ need, stepNum, busy, onAct }: RowProps) {
  const form = need.form!;
  const filled = form.groups.reduce((n, g) => n + g.filled, 0);
  const total = form.groups.reduce((n, g) => n + g.total, 0);
  return (
    <section className="needs-section" aria-label={form.title}>
      <div className="needs-section-head">
        <span>
          {form.title} <em>{filled}/{total}</em>
        </span>
        <span className="nf-form-portal">{form.portal}</span>
      </div>
      <p className="nf-form-note">{need.detail}</p>
      {form.groups.map((group) => (
        <fieldset key={group.key} className="nf-group" data-complete={group.complete || undefined} title={group.sourceLabel}>
          <legend>
            {group.title} <em>{group.filled}/{group.total}</em>
          </legend>
          <div className="needs-grid">
            {group.fields.map((field) => (
              // Keyed by value so a server update refreshes the input.
              <FormField key={`${field.storageLabel}:${field.value ?? ""}`} field={field} stepNum={stepNum} busy={busy} onAct={onAct} />
            ))}
          </div>
        </fieldset>
      ))}
    </section>
  );
}

function FormField({ field, stepNum, busy, onAct }: { field: FormFieldView; stepNum: number; busy: string | null; onAct: Act }) {
  const key = `value:${field.storageLabel}`;
  const save = (raw: string) => {
    const value = raw.trim();
    if (value && value !== (field.value ?? "")) void onAct(key, { action: "value", stepNum, label: field.storageLabel, value });
  };

  if (field.kind === "checkbox") {
    return (
      <label className="nf-check">
        <input
          type="checkbox"
          defaultChecked={field.value === "yes"}
          disabled={Boolean(busy)}
          onChange={(event) => void onAct(key, { action: "value", stepNum, label: field.storageLabel, value: event.target.checked ? "yes" : "no" })}
        />
        {field.label}
      </label>
    );
  }

  return (
    <label className="needs-field" data-status={field.missing ? "missing" : field.value ? "have" : undefined} title={field.hint ?? undefined}>
      <span>
        <span className="needs-field-label">{field.label}</span>
        {field.required ? <b className="nf-req">*</b> : null}
        {busy === key ? <em>saving…</em> : field.from && field.from !== "default" ? <em className="nf-src">from {field.from}</em> : null}
      </span>
      {field.kind === "select" ? (
        <select defaultValue={field.value ?? ""} onChange={(event) => save(event.target.value)}>
          <option value="" disabled>
            Choose…
          </option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.kind === "date" ? "date" : "text"}
          defaultValue={field.value ?? ""}
          placeholder={field.hint ?? (field.required ? "Required" : "Optional")}
          onBlur={(event) => save(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      )}
    </label>
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
  const suggestions = need.status === "have" ? [] : need.suggestions ?? [];
  return (
    <div className="nf-value">
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
      {need.explanation && need.status !== "have" ? <small className="nf-explain">{need.explanation}</small> : null}
      {suggestions.length ? (
        <span className="nf-suggest" aria-label={`Suggested values for ${need.label}`}>
          {suggestions.map((s) => (
            <button
              key={s.value}
              type="button"
              className="prompt prompt-sm"
              title={`From ${s.source}`}
              disabled={Boolean(busy)}
              onClick={() => void onAct(key, valuePayload(stepNum, need, s.value))}
            >
              Use {s.label}
            </button>
          ))}
        </span>
      ) : null}
    </div>
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
            {doc?.fields.length && need.status === "have" ? (
              <button type="button" className="prompt prompt-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                {open ? "Hide fields" : `Fields read (${doc.fields.filter((f) => f.value).length})`}
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
      {doc && open ? <DocumentReview doc={doc} caseId={caseId} busy={busy} onAct={onAct} readOnly={need.status === "have"} /> : null}
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

const READER_LINE: Record<NonNullable<DocumentRecord["reader"]>, string> = {
  docai: "Read by the document AI",
  demo: "Demo pack — the document AI service isn't running, so this page's own record was used",
  text: "Read from the file's own text",
  blank: "Couldn't be read",
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** What was read from a document, field by field: the value, how sure the
 *  reading is, and where on the page it came from. Editable until confirmed. */
/** One document field's value.
 *
 * A field the reader could not find, or read two ways, is the commonest thing
 * to go wrong with a demo document - so neither is left for the trader to
 * guess at. The values the field may hold are offered (as a dropdown, and as
 * buttons when the list is short enough to show), and every other reading OCR
 * produced is a button that fills the box, instead of the note it used to be.
 * Free text still goes in: a country outside the fixture is a real country. */
function ValueCell({ field, docId, value, onPick }: { field: ExtractedField; docId: string; value: string; onPick: (v: string) => void }) {
  const options = FIELD_OPTIONS[field.kind] ?? [];
  const listId = options.length ? `doc-opts-${docId}-${field.key}` : undefined;
  // Worth showing a closed list of twelve; a country list belongs in the dropdown.
  const chips = !value && options.length && options.length <= 12 ? options : [];
  return (
    <>
      <input aria-label={field.label} list={listId} value={value} onChange={(event) => onPick(event.target.value)} />
      {listId ? (
        <datalist id={listId}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      ) : null}
      {field.alternatives.length ? (
        <span className="doc-alt">
          <span>Also read:</span>
          {field.alternatives.map((alt) => (
            <button key={alt} type="button" aria-pressed={value === alt} onClick={() => onPick(alt)}>
              {alt}
            </button>
          ))}
        </span>
      ) : null}
      {chips.length ? (
        <span className="doc-alt doc-opts">
          {chips.map((option) => (
            <button key={option} type="button" onClick={() => onPick(option)}>
              {option}
            </button>
          ))}
        </span>
      ) : null}
    </>
  );
}

function DocumentReview({ doc, caseId, busy, onAct, readOnly = false }: { doc: DocumentRecord; caseId: string; busy: string | null; onAct: Act; readOnly?: boolean }) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const key = `doc:${doc.docId}`;
  /** The value shown for a field: the trader's pending edit, else what was read. */
  const shown = (fieldKey: string, read: string | null) => edits[fieldKey] ?? read ?? "";
  const put = (fieldKey: string, value: string) => setEdits((prev) => ({ ...prev, [fieldKey]: value }));
  const pending = Object.entries(edits).filter(([k, v]) => v !== (doc.fields.find((f) => f.key === k)?.value ?? "")).length;
  const read = doc.fields.filter((f) => f.value);
  const accepted = doc.fields.filter((f) => f.status === "accepted").length;
  const confirmed = doc.fields.filter((f) => f.status === "confirmed").length;
  const review = doc.fields.filter((f) => f.status === "review").length;
  const missing = doc.fields.filter((f) => f.status === "missing").length;
  const reader = doc.reader ?? (doc.fields.some((f) => f.source === "deterministic-fallback" || f.source === "demo-pack") ? "demo" : doc.fields.length ? "docai" : undefined);

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
        {reader ? ` · ${READER_LINE[reader]}` : ""}
        {reader === "docai" && doc.models ? ` (${doc.models.ocr}, ${doc.models.qa})` : ""}
      </p>
      {doc.parseError ? <p className="assistant-paused">{doc.parseError} Fill in the fields below instead.</p> : null}
      {!doc.typeMatches && doc.detectedType ? (
        <p className="assistant-paused">This looks like a {doc.detectedType.replace(/_/g, " ")}. Upload the right document, or correct and confirm it.</p>
      ) : null}
      {doc.fields.length ? (
        <>
          <p className="doc-summary">
            <strong>
              Read {read.length} of {doc.fields.length} fields
            </strong>
            {accepted ? <span data-status="accepted">{accepted} accepted (≥ {pct(GATE.accept)})</span> : null}
            {review ? <span data-status="review">{review} to confirm ({pct(GATE.review)}–{pct(GATE.accept - 0.01)})</span> : null}
            {missing ? <span data-status="missing">{missing} not found</span> : null}
            {confirmed ? <span data-status="confirmed">{confirmed} confirmed</span> : null}
          </p>
          <div className="doc-fields-wrap">
            <table className="doc-fields">
              <thead>
                <tr>
                  <th scope="col">Field</th>
                  <th scope="col">Value</th>
                  <th scope="col">Confidence</th>
                  <th scope="col">Where it was found</th>
                </tr>
              </thead>
              <tbody>
                {doc.fields.map((f) => {
                  const where = describeEvidence(f);
                  return (
                    <tr key={f.key} data-status={f.status}>
                      <th scope="row">
                        {f.label}
                        {f.required ? <span title="Required before the step can move"> *</span> : null}
                      </th>
                      <td>
                        {readOnly ? (
                          <span className="doc-value">{f.value ?? "—"}</span>
                        ) : (
                          <ValueCell field={f} docId={doc.docId} value={shown(f.key, f.value)} onPick={(v) => put(f.key, v)} />
                        )}
                      </td>
                      <td>
                        <span className="doc-conf" data-status={f.status}>
                          <span className="doc-meter" aria-hidden="true">
                            <span style={{ width: pct(f.value ? f.confidence : 0) }} />
                          </span>
                          {f.value ? pct(f.confidence) : "—"}
                          <small>{f.status === "confirmed" ? "confirmed" : f.status === "accepted" ? "accepted" : f.status === "review" ? "confirm" : "not found"}</small>
                        </span>
                      </td>
                      <td className="doc-where">
                        <strong>{where.method}</strong>
                        <span>
                          {where.detail}
                          {where.page ? ` · page ${where.page}` : ""}
                        </span>
                        {where.agreed.length ? <small>Agreed: {where.agreed.join(", ")}</small> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      {doc.checks.length ? (
        <ul className="doc-checks">
          {doc.checks.map((c) => {
            const pick = c.status === "mismatch" && c.compared && !readOnly ? c.compared : null;
            // "Keep" writes the document's own words back, so confirming does
            // not quietly replace them with the formatted comparison value.
            const asRead = pick ? doc.fields.find((f) => f.key === pick.fieldKey)?.value ?? pick.here : "";
            return (
              <li key={c.check} data-status={c.status}>
                <strong>{c.check}:</strong> {c.detail}
                {pick ? (
                  <span className="doc-resolve">
                    <span className="doc-resolve-ask">Which is right?</span>
                    <button type="button" aria-pressed={shown(pick.fieldKey, asRead) === asRead} onClick={() => put(pick.fieldKey, asRead)}>
                      {pick.here} <small>this document</small>
                    </button>
                    <button type="button" aria-pressed={shown(pick.fieldKey, asRead) === pick.there} onClick={() => put(pick.fieldKey, pick.there)}>
                      {pick.there} <small>{pick.thereLabel}</small>
                    </button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {pending && !readOnly ? (
        <p className="doc-pending">
          {pending} {pending === 1 ? "field has" : "fields have"} an unsaved change — confirm below to save {pending === 1 ? "it" : "them"}.
        </p>
      ) : null}
      {readOnly ? null : (
        <button
          type="button"
          className="prompt prompt-sm"
          disabled={Boolean(busy)}
          onClick={() => void onAct(key, { action: "confirm-document", docId: doc.docId, corrections: edits, confirmAll: true })}
        >
          {busy === key ? "Saving…" : review || missing ? `Confirm fields (${review + missing} need a look)` : "Confirm fields"}
        </button>
      )}
    </div>
  );
}
