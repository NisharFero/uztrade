"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type ProcedureRow = {
  id: string;
  title: string;
  direction: string;
  goods: string;
  mode: string;
  kind: string;
  kindLabel: string;
  blocks: number;
  steps: number;
  online: number;
  entities: number;
  timeframe: string;
};

const KINDS = [
  { id: "all", label: "All" },
  { id: "customs", label: "Customs" },
  { id: "logistics", label: "Logistics" },
  { id: "service", label: "Service" },
];

/** 243 procedures is too many to scan, so they are searched by title, goods,
 *  id or mode, and filtered by what kind of procedure they are. */
export default function ProcedureFilter({ rows }: { rows: ProcedureRow[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((p) => {
      if (kind !== "all" && p.kind !== kind) return false;
      if (!q) return true;
      return `${p.id} ${p.title} ${p.goods} ${p.mode} ${p.direction}`.toLowerCase().includes(q);
    });
  }, [rows, query, kind]);

  return (
    <>
      <div className="proc-filter">
        <label className="sr-only" htmlFor="procedure-search">
          Search procedures
        </label>
        <input
          id="procedure-search"
          type="search"
          value={query}
          placeholder="Search by goods, title, mode or id — “tea”, “by air”, “868”"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="proc-kinds" role="group" aria-label="Kind of procedure">
          {KINDS.map((k) => (
            <button key={k.id} type="button" className="prompt" data-active={kind === k.id || undefined} onClick={() => setKind(k.id)}>
              {k.label}
            </button>
          ))}
        </div>
        <span className="proc-count">
          {shown.length} of {rows.length}
        </span>
      </div>

      <div className="proc-grid">
        {shown.map((p) => (
          <Link className="proc-card" href={`/procedures/${p.id}`} key={p.id}>
            <div className="proc-card-head">
              <span className="proc-id">{p.id}</span>
              <span className="proc-mode" data-mode={p.mode}>
                {p.direction}
                {p.mode === "any" ? "" : ` · ${p.mode}`}
              </span>
            </div>
            <h2>{p.title}</h2>

            <dl className="proc-stats">
              <div>
                <dt>Blocks</dt>
                <dd>{p.blocks}</dd>
              </div>
              <div>
                <dt>Steps</dt>
                <dd>{p.steps}</dd>
              </div>
              <div>
                <dt>Published</dt>
                <dd>{p.timeframe}</dd>
              </div>
              <div>
                <dt>Entities</dt>
                <dd>{p.entities}</dd>
              </div>
            </dl>

            <div className="proc-hs">
              {p.kindLabel} · {p.online} of {p.steps} steps online
            </div>
          </Link>
        ))}
      </div>

      {shown.length === 0 ? <p className="plan-empty">No procedure matches “{query}”.</p> : null}
    </>
  );
}
