"use client";

import { useEffect, useState } from "react";
import type { Procedure } from "../data/procedures.generated";

type AuditEvent = {
  id: string;
  nodeId: string | null;
  eventType: string;
  actorType: string;
  actorId: string | null;
  createdAt?: string;
};

const AGENT_NAMES: Record<string, string> = {
  document_intelligence: "Document Intelligence",
  compliance_risk: "Compliance & Risk",
  inspection_scheduler: "Inspection scheduler",
  procedure_executor: "Procedure executor",
};

function who(e: AuditEvent): string {
  if (e.actorType === "agent") return `${AGENT_NAMES[e.actorId ?? ""] ?? "An"} agent`;
  if (e.actorType === "user") return e.actorId === "usr-trader" || !e.actorId ? "You" : e.actorId;
  return "Orchestrator";
}

/** D1 stores UTC as "YYYY-MM-DD HH:MM:SS"; show it in the viewer's time. */
function when(createdAt?: string): string {
  if (!createdAt) return "";
  const hasZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(createdAt);
  const d = new Date(`${createdAt.replace(" ", "T")}${hasZone ? "" : "Z"}`);
  if (Number.isNaN(d.getTime())) return createdAt;
  return d.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

const WHAT: Record<string, string> = {
  agent_node_completed: "completed",
  work_item_created: "handed over — waiting on you",
  work_item_completed: "confirmed done",
  optional_node_skipped: "skipped — optional route not taken",
};

/** The case ledger: the workflow engine's append-only record of every node
 *  transition, newest first. Nothing here is edited in place, so it is what
 *  to read when asking "who did what, and when" on a stalled case. */
export default function CaseLedger({ caseId, procedure, version }: { caseId: string; procedure: Procedure; version: unknown }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/audit-events?runId=${encodeURIComponent(`workflow:${caseId}`)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { auditEvents?: AuditEvent[] }) => {
        if (live) setEvents(body.auditEvents ?? []);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [caseId, version]);

  const titleOf = (nodeId: string | null) => {
    const [blockId, stepNum] = (nodeId ?? "").split(":").slice(-2);
    const step = procedure.blocks.find((b) => b.id === blockId)?.steps.find((s) => s.num === Number(stepNum));
    return step ? `Step ${step.num} · ${step.title}` : "Case";
  };

  const rows = [...(events ?? [])].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.id.localeCompare(a.id));

  return (
    <details className="ledger">
      <summary>
        <span className="wf-detail-h">Case ledger</span>
        <span className="ledger-count">
          {failed ? "unavailable" : events ? `${events.length} event${events.length === 1 ? "" : "s"} · append-only` : "loading…"}
        </span>
      </summary>
      {rows.length ? (
        <ol className="ledger-list">
          {rows.map((e) => (
            <li key={e.id} data-actor={e.actorType}>
              <time dateTime={e.createdAt}>{when(e.createdAt)}</time>
              <span>
                <strong>{titleOf(e.nodeId)}</strong> {WHAT[e.eventType] ?? e.eventType.replace(/_/g, " ")}
              </span>
              <em>{who(e)}</em>
            </li>
          ))}
        </ol>
      ) : events ? (
        <p className="plan-empty">No events recorded for this case yet.</p>
      ) : null}
    </details>
  );
}
