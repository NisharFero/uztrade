"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../icons";
import type { Procedure } from "../../modules/procedures/data/procedures.generated";
import type { ShipmentFacts } from "../../modules/workflow/domain";
import { assessRisk, type RiskReport, type RiskRow } from "../../modules/compliance/risk";

const STATUS_LABEL: Record<RiskRow["status"], string> = {
  ok: "OK",
  pending: "Pending",
  caution: "Caution",
  high: "High",
  unknown: "Not known",
};

/** Compliance & Risk: title · value · reason, every row computed for this case.
 *  On a live case the rows come from the server (they include workflow state
 *  and uploaded documents); on a procedure template they are computed here
 *  from the procedure alone. The "!" on a row says why this procedure needs
 *  the check, where the agent gets it, and how it is cross-verified. */
export default function CompliancePanel({
  procedure,
  facts,
  query = "",
  caseId,
}: {
  procedure: Procedure;
  facts?: Partial<ShipmentFacts>;
  query?: string;
  caseId?: string;
}) {
  const local = useMemo(() => assessRisk({ procedure, facts, query }), [procedure, facts, query]);
  const [remote, setRemote] = useState<RiskReport | null>(null);
  const [open, setOpen] = useState<RiskRow | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!caseId) return;
    let live = true;
    fetch(`/api/cases/${caseId}/risk`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (live && body) setRemote(body);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [caseId]);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const report = remote ?? local;

  return (
    <section className="cr-panel" aria-label="Compliance & risk">
      <div className="section-head">
        <p>
          <span className="head-icon" data-tint="rose">
            {Icon.compliance}
          </span>
          Compliance &amp; Risk
        </p>
        <h2>Risk analysis</h2>
      </div>

      <div className="risk-overall" data-status={report.overall.status}>
        <strong>{report.overall.value}</strong>
        <span>{report.overall.reason}</span>
      </div>

      <div className="risk-table-wrap">
        <table className="risk-table">
          <thead>
            <tr>
              <th scope="col">Check</th>
              <th scope="col">Value</th>
              <th scope="col">Reason</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.key} data-status={row.status}>
                <th scope="row">
                  <span className="risk-dot" data-status={row.status} aria-label={STATUS_LABEL[row.status]} />
                  {row.title}
                  {row.explain ? (
                    <span className="risk-why">
                      <button type="button" className="risk-why-btn" aria-label={`Why ${row.title} matters for procedure ${procedure.id}`} onClick={() => setOpen(row)}>
                        !
                      </button>
                      <span className="risk-why-tip" role="tooltip">
                        {row.explain.why}
                        <em>Click for sources and cross-checks</em>
                      </span>
                    </span>
                  ) : null}
                </th>
                <td>{row.value}</td>
                <td>{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="cr-disclaimer">
        Advisory. Country rows come from the supplied country list; the agent never places or releases a hold on its own.
      </p>

      <dialog ref={dialog} className="risk-dialog" onClose={() => setOpen(null)} onClick={(event) => event.target === dialog.current && setOpen(null)}>
        {open?.explain ? (
          <div className="risk-dialog-body">
            <header>
              <span className="risk-dot" data-status={open.status} aria-hidden="true" />
              <div>
                <small>
                  Procedure {procedure.id} · {STATUS_LABEL[open.status]}
                </small>
                <h3>{open.title}</h3>
                <p className="risk-dialog-value">
                  {open.value} — {open.reason}
                </p>
              </div>
              <button type="button" className="risk-dialog-close" aria-label="Close" onClick={() => setOpen(null)}>
                ×
              </button>
            </header>

            <section>
              <h4>Why this procedure needs it</h4>
              <p>{open.explain.why}</p>
            </section>

            <section>
              <h4>Where the agent gets it</h4>
              {open.explain.sources.length ? (
                <ul className="risk-sources">
                  {open.explain.sources.map((s) => (
                    <li key={`${s.document}-${s.where}`} data-have={s.have || undefined}>
                      <span className="risk-source-mark">{s.have ? Icon.check : null}</span>
                      <span>
                        <strong>{s.document}</strong> <small>{s.where}</small>
                        {s.fields.length ? <span className="risk-fields">Reads: {s.fields.join(" · ")}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="needs-meta">Nothing to read — the row is computed from the procedure alone.</p>
              )}
            </section>

            <section>
              <h4>How it is cross-verified</h4>
              <ul className="risk-verify">
                {open.explain.verify.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
            </section>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}
