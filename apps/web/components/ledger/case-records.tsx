"use client";

import { useEffect, useMemo, useState } from "react";
import CaseLedger from "../workflow/case-ledger";
import { PORTAL_STATUS, type PortalRow } from "../chat/step-assistant";
import type { AssistantView } from "../../modules/steps/assistant";
import type { ShipmentFacts } from "../../modules/workflow/domain";
import type { Procedure } from "../../modules/procedures/data/procedures.generated";
import { tailorProcedure } from "../../modules/workflow/tailor";

/** One case's records: the append-only ledger and every application the
 *  agent filed with an entity API, with the latest answer per step. */
export default function CaseRecords({
  caseId,
  procedureId,
  publishedProcedure,
  shipment,
  query,
}: {
  caseId: string;
  procedureId: string;
  /** Loaded by the page; a client component cannot read a workflow file. */
  publishedProcedure: Procedure;
  shipment?: ShipmentFacts;
  query?: string;
}) {
  const [portals, setPortals] = useState<PortalRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const published = publishedProcedure;
  const procedure = useMemo(() => (published ? tailorProcedure(published, shipment, query) : undefined), [published, shipment, query]);

  useEffect(() => {
    let live = true;
    setPortals(null);
    setFailed(false);
    fetch(`/api/cases/${caseId}/assistant`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((view: AssistantView) => live && setPortals(view.portals ?? []))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [caseId]);

  if (!procedure) return null;

  return (
    <div className="ledger-page">
      <CaseLedger caseId={caseId} procedure={procedure} open />
      <section className="ledger entity-records" aria-label="Entity API records">
        <div className="ledger-summary">
          <span className="wf-detail-h">Entity API records</span>
          <span className="ledger-count">
            {failed ? "unavailable" : portals ? `${portals.length} application${portals.length === 1 ? "" : "s"}` : "loading…"}
          </span>
        </div>
        {portals?.length ? (
          <ul className="portal-list-rows">
            {portals.map((r) => (
              <li key={r.stepNum} className="portal-row">
                <span className="portal-chip" data-status={r.status}>
                  {PORTAL_STATUS[r.status]}
                </span>
                <span className="portal-row-main">
                  <strong>
                    Step {r.stepNum} · {r.entityName}
                  </strong>
                  <small>
                    {r.serviceTitle}
                    {r.reference ? ` · ${r.reference}` : ""}
                    {r.revision > 1 ? ` · revision ${r.revision}` : ""}
                  </small>
                  {r.status === "approved" && Object.keys(r.outputs).length ? (
                    <small className="portal-issued">
                      {Object.entries(r.outputs)
                        .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
                        .join(" · ")}
                    </small>
                  ) : null}
                  {r.status !== "approved" && r.flags.length ? (
                    <small className="portal-flags">{r.flags.map((f) => `${f.label} — ${f.reason}`).join(" · ")}</small>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : portals ? (
          <p className="plan-empty">The agent has not filed anything with an entity API for this case yet.</p>
        ) : null}
      </section>
    </div>
  );
}
