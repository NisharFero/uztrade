"use client";

import { useEffect, useState } from "react";
import { Icon } from "../icons";
import type { RiskReport } from "../../modules/compliance/risk";
import type { AssistantView } from "../../modules/steps/assistant";
import type { TransitView } from "../../modules/transit/transit";
import { hours, LANE_LABEL, plural, readJson } from "./format";

const RISK_WORD: Record<string, string> = { ok: "Clear", pending: "Pending", caution: "Check", high: "High", unknown: "Unknown" };

/**
 * Block 3: what the agents see, each read from the case's own records - the
 * documents in the ledger, the risk rules against the shipment, and the
 * workflow and transit state - never from anything said in a chat.
 * `version` changes after every action, so they reload with the step.
 */
export default function AgentBlocks({ view, version, onExplain }: { view: AssistantView; version: number; onExplain: (question: string) => void }) {
  return (
    <div className="agent-blocks">
      <DocumentsBlock view={view} onExplain={onExplain} />
      <RiskBlock caseId={view.caseId} version={version} />
      <WorkflowBlock view={view} version={version} />
    </div>
  );
}

function DocumentsBlock({ view, onExplain }: { view: AssistantView; onExplain: (question: string) => void }) {
  const docs = view.documents;
  const fields = docs.flatMap((d) => d.fields);
  const verified = fields.filter((f) => f.status === "accepted" || f.status === "confirmed").length;
  const review = fields.filter((f) => f.status === "review").length;
  const mismatches = docs.flatMap((d) => d.checks.filter((c) => c.status === "mismatch").map((c) => ({ doc: d.label, ...c })));
  const expected = view.upfront.items.filter((i) => i.kind === "document").length;

  return (
    <section className="block agent-block" aria-labelledby="docs-title">
      <header className="agent-head">
        <span className="block-icon">{Icon.documents}</span>
        <h3 id="docs-title">Document analysis</h3>
        <span className="agent-state" data-tone={mismatches.length ? "caution" : docs.length ? "ok" : "idle"}>
          {mismatches.length ? plural(mismatches.length, "mismatch") : docs.length ? "Reading" : "Waiting"}
        </span>
      </header>
      {docs.length ? (
        <>
          <p className="agent-line">
            {plural(docs.length, "document")} of about {expected} read · {verified} fields verified
            {review ? `, ${review} to check` : ""}
          </p>
          <ul className="agent-list">
            {docs.slice(-4).reverse().map((d) => (
              <li key={`${d.docId}:${d.version}`}>
                <span data-tone={d.parseError ? "high" : d.confirmed ? "ok" : "caution"}>{d.parseError ? "!" : d.confirmed ? "✓" : "…"}</span>
                <div>
                  <strong>{d.label}</strong>
                  <small>
                    {d.fileName} · step {d.stepNum}
                    {d.confirmed ? " · confirmed" : d.parseError ? " · could not be read" : " · waiting for your check"}
                  </small>
                </div>
                <button type="button" className="link" onClick={() => onExplain(`Explain the ${d.label} I uploaded (${d.fileName}) and whether anything in it still needs checking.`)}>
                  Explain
                </button>
              </li>
            ))}
          </ul>
          {mismatches.length ? (
            <p className="agent-warn">
              {mismatches[0].doc}: {mismatches[0].detail}
              {mismatches.length > 1 ? ` (+${mismatches.length - 1} more)` : ""}
            </p>
          ) : null}
        </>
      ) : (
        <p className="agent-line">Nothing uploaded yet. Each document is read and checked against the shipment as soon as its step asks for it.</p>
      )}
    </section>
  );
}

function RiskBlock({ caseId, version }: { caseId: string; version: number }) {
  const [report, setReport] = useState<RiskReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/cases/${caseId}/risk`)
      .then((r) => readJson<RiskReport>(r, "Risk is unavailable"))
      .then((r) => live && (setReport(r), setError(null)))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [caseId, version]);

  const flagged = report?.rows.filter((r) => r.status === "high" || r.status === "caution") ?? [];
  const shown = (flagged.length ? flagged : report?.rows ?? []).slice(0, 4);

  return (
    <section className="block agent-block" aria-labelledby="risk-title">
      <header className="agent-head">
        <span className="block-icon">{Icon.compliance}</span>
        <h3 id="risk-title">Risk analysis</h3>
        {report ? (
          <span className="agent-state" data-tone={report.overall.status}>
            {RISK_WORD[report.overall.status] ?? report.overall.status}
          </span>
        ) : null}
      </header>
      {error ? <p className="agent-line">{error}</p> : null}
      {report ? (
        <>
          <p className="agent-line">{report.overall.reason}</p>
          <ul className="agent-list">
            {shown.map((row) => (
              <li key={row.key}>
                <span data-tone={row.status}>{row.status === "ok" ? "✓" : row.status === "high" ? "!" : "·"}</span>
                <div>
                  <strong>{row.title}</strong>
                  <small>{row.value}</small>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : !error ? (
        <p className="agent-line">Checking…</p>
      ) : null}
    </section>
  );
}

function WorkflowBlock({ view, version }: { view: AssistantView; version: number }) {
  const [transit, setTransit] = useState<(TransitView & { recorded?: unknown }) | null>(null);
  const k = view.kpis;

  useEffect(() => {
    let live = true;
    fetch(`/api/cases/${view.caseId}/transit`)
      .then((r) => readJson<TransitView>(r, "Transit is unavailable"))
      .then((t) => live && setTransit(t))
      .catch(() => live && setTransit(null));
    return () => {
      live = false;
    };
  }, [view.caseId, version]);

  const exception = transit?.exceptions.find((e) => e.severity !== "info");

  return (
    <section className="block agent-block" aria-labelledby="flow-title">
      <header className="agent-head">
        <span className="block-icon">{Icon.truck}</span>
        <h3 id="flow-title">Transit & workflow</h3>
        <span className="agent-state" data-tone={exception ? "caution" : "ok"}>
          {transit?.status.label ?? "—"}
        </span>
      </header>
      <dl className="agent-facts">
        <div>
          <dt>Steps</dt>
          <dd>
            {k.completed}/{k.total}
          </dd>
        </div>
        <div>
          <dt>Agent filings</dt>
          <dd>
            {k.agentDone}/{k.agentTotal}
          </dd>
        </div>
        <div>
          <dt>To go</dt>
          <dd>{hours(k.etaHours)}</dd>
        </div>
      </dl>
      {transit?.route ? (
        <p className="agent-line">
          {transit.route.origin} → {transit.route.destination}
          {transit.route.distanceKm ? ` · ~${transit.route.distanceKm.toLocaleString("en-US")} km` : ""}
          {transit.route.transitHours ? ` · ${hours(transit.route.transitHours)} on the way` : ""}
          {transit.route.borders ? ` · ${plural(transit.route.borders, "border")}` : ""}
        </p>
      ) : null}
      {transit?.status.next ? (
        <p className="agent-line">
          Movement waits on step {transit.status.next.stepNum}, {transit.status.next.title} ({LANE_LABEL[transit.status.next.lane] ?? transit.status.next.lane}).
        </p>
      ) : null}
      {exception ? <p className="agent-warn">{exception.title}: {exception.detail}</p> : null}
      {view.recent.length ? (
        <ul className="agent-feed">
          {view.recent.slice(0, 3).map((item, i) => (
            <li key={i}>{item.text}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
