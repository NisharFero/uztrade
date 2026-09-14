"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../icons";
import type { Procedure } from "../data/procedures.generated";
import type { ShipmentFacts } from "../domain/workflow";
import { assessRisk, type RiskReport, type RiskRow } from "../lib/risk";

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
 *  from the procedure alone. */
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
    </section>
  );
}
