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
  /** Steps by who does them, or null when the corpus could not be read. */
  split: { user: number; agent: number; physical: number } | null;
};

/* Who does the work, in a fixed order that reads from "mine" to "nobody's
   hands": you, then the agent, then the goods. Each band is labelled with its
   own percentage, so the proportions are legible with the colour removed -
   which also covers the print and forced-colours cases. */
const LANES = [
  { id: "user", label: "You", hue: "blue" },
  { id: "agent", label: "Agent", hue: "cyan" },
  { id: "physical", label: "Physical", hue: "amber" },
] as const;

/* Largest remainder, so the three printed percentages always total 100.
   Rounding each one on its own showed "43% + 29% + 29%" on procedure 32, and
   a card that visibly adds up to 101 reads as a bug in the numbers. */
function shares(split: NonNullable<ProcedureRow["split"]>): Record<"user" | "agent" | "physical", number> {
  const total = split.user + split.agent + split.physical;
  if (!total) return { user: 0, agent: 0, physical: 0 };
  const exact = LANES.map((l) => ({ id: l.id, raw: (split[l.id] / total) * 100 }));
  const out = Object.fromEntries(exact.map((e) => [e.id, Math.floor(e.raw)])) as Record<"user" | "agent" | "physical", number>;
  let left = 100 - Object.values(out).reduce((a, c) => a + c, 0);
  for (const e of [...exact].sort((a, z) => (z.raw % 1) - (a.raw % 1))) {
    if (left <= 0) break;
    out[e.id] += 1;
    left -= 1;
  }
  return out;
}

function LaneBar({ split, steps }: { split: NonNullable<ProcedureRow["split"]>; steps: number }) {
  const share = shares(split);
  return (
    <div className="proc-lanes">
      <div
        className="proc-lane-bar"
        role="img"
        aria-label={LANES.map((l) => `${l.label} ${share[l.id]}% (${split[l.id]} of ${steps} steps)`).join(", ")}
      >
        {LANES.map((l) =>
          split[l.id] ? <span key={l.id} data-hue={l.hue} style={{ flexGrow: split[l.id] }} /> : null,
        )}
      </div>
      <ul className="proc-lane-key">
        {LANES.map((l) => (
          <li key={l.id} data-zero={split[l.id] ? undefined : "true"}>
            <i data-hue={l.hue} aria-hidden="true" />
            {l.label} <strong>{share[l.id]}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

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

            {p.split ? <LaneBar split={p.split} steps={p.steps} /> : null}

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
