"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type CaseRowData = {
  id: string;
  title: string;
  /** "20 t · 1 covered wagon · Tashkent → Urumqi (to China) · HS 0902" */
  line: string;
  procedureId: string;
  plan: string | null;
  done: number;
  total: number;
  ready: string[];
  status: string;
};

type StatusFilter = "all" | "active" | "complete";
const FILTERS: [StatusFilter, string][] = [
  ["all", "All"],
  ["active", "Active"],
  ["complete", "Complete"],
];

const matchesStatus = (row: CaseRowData, filter: StatusFilter) =>
  filter === "all" || (filter === "complete" ? row.status === "complete" : row.status !== "complete");

/** The case table with a search box and status filter - everything is already
 *  on the page, so filtering is instant and needs no round-trip. */
export default function CaseList({ rows }: { rows: CaseRowData[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map(([key]) => [key, rows.filter((r) => matchesStatus(r, key)).length])) as Record<StatusFilter, number>,
    [rows],
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) => matchesStatus(r, status) && (!q || [r.id, r.title, r.line, `procedure ${r.procedureId}`, ...r.ready].join(" ").toLowerCase().includes(q)),
    );
  }, [rows, query, status]);

  return (
    <section className="agent-output" aria-label="Case list">
      <div className="case-toolbar">
        <label className="case-search">
          <span className="sr-only">Search cases</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by reference, goods, route or procedure" />
        </label>
        <div className="case-filters" role="group" aria-label="Filter by status">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" className="prompt prompt-sm" data-chosen={status === key || undefined} aria-pressed={status === key} onClick={() => setStatus(key)}>
              {label} <em>{counts[key]}</em>
            </button>
          ))}
        </div>
      </div>

      {shown.length ? (
        <div className="case-table" role="table">
          <div className="case-row case-head" role="row">
            <span role="columnheader">Reference</span>
            <span role="columnheader">Shipment</span>
            <span role="columnheader">Progress</span>
            <span role="columnheader">Ready now</span>
            <span role="columnheader">Status</span>
          </div>
          {shown.map((r) => (
            <Link className="case-row" role="row" href={`/cases/${r.id}`} key={r.id}>
              <span role="cell" className="case-ref">
                {r.id}
              </span>
              <span role="cell">
                <strong>{r.title}</strong>
                <small>
                  {r.line ? `${r.line} · ` : ""}Procedure {r.procedureId}
                  {r.plan ? ` · plan ${r.plan}` : ""}
                </small>
              </span>
              <span role="cell" className="case-progress">
                <span className="case-bar">
                  <span style={{ width: `${r.total ? (r.done / r.total) * 100 : 0}%` }} />
                </span>
                <small>
                  {r.done}/{r.total} blocks
                </small>
              </span>
              <span role="cell" className="case-ready">
                {r.ready.length ? r.ready.slice(0, 2).map((name) => <em key={name}>{name}</em>) : <em className="is-muted">—</em>}
                {r.ready.length > 2 ? <em className="is-muted">+{r.ready.length - 2} more</em> : null}
              </span>
              <span role="cell">
                <mark data-tone={r.status === "complete" ? "ok" : "info"}>{r.status}</mark>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="needs-empty">
          No cases match{query.trim() ? ` “${query.trim()}”` : ""}
          {status !== "all" ? ` among ${status} cases` : ""}.{" "}
          <button
            type="button"
            className="intake-link"
            onClick={() => {
              setQuery("");
              setStatus("all");
            }}
          >
            Clear filters
          </button>
        </p>
      )}
    </section>
  );
}
