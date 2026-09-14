import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "../icons";
import { PROCEDURES } from "../data/procedures.generated";
import { listCases } from "../lib/case-store";
import { fmtHours, procedureStats } from "../lib/dag";

export const metadata: Metadata = {
  title: "Cases & Shipments · UzTrade",
  description: "Open cases and their progress through each procedure.",
};

export const dynamic = "force-dynamic";

export default async function CasesPage() {
  let cases: Awaited<ReturnType<typeof listCases>> = [];
  let error: string | null = null;
  try {
    cases = await listCases();
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load cases";
  }

  return (
    <>
      <header className="page-head">
        <p>
          <span className="head-icon">{Icon.shipments}</span>
          Cases &amp; Shipments
        </p>
        <h1>Open cases</h1>
        <p className="page-lede">
          Every case is one shipment moving through one procedure. Status is derived from the dependency graph — a block becomes ready
          only when all of its dependencies are done.
        </p>
      </header>

      {error ? (
        <p className="query-note" data-tone="error">
          <span className="head-icon">{Icon.clock}</span>
          {error}
        </p>
      ) : null}

      {!error && cases.length === 0 ? (
        <section className="empty-panel">
          <h2>No cases yet</h2>
          <p>Ask a question on the dashboard — &ldquo;I want to export tea by train&rdquo; — and a case will be opened against the matching procedure.</p>
          <Link className="empty-cta" href="/">
            Open the assistant
          </Link>
        </section>
      ) : null}

      {cases.length ? (
        <section className="agent-output" aria-label="Case list">
          <div className="case-table" role="table">
            <div className="case-row case-head" role="row">
              <span role="columnheader">Reference</span>
              <span role="columnheader">Procedure</span>
              <span role="columnheader">Progress</span>
              <span role="columnheader">Ready now</span>
              <span role="columnheader">Status</span>
            </div>
            {cases.map((c) => {
              const procedure = PROCEDURES[c.procedureId];
              const total = procedure?.blocks.length ?? c.blocks.length;
              const done = c.blocks.filter((b) => b.state === "done").length;
              const ready = c.blocks.filter((b) => b.state === "running");
              const stats = procedure ? procedureStats(procedure) : null;
              return (
                <Link className="case-row" role="row" href={`/cases/${c.id}`} key={c.id}>
                  <span role="cell" className="case-ref">
                    {c.id}
                  </span>
                  <span role="cell">
                    <strong>{c.title}</strong>
                    <small>
                      Procedure {c.procedureId}
                      {stats ? ` · plan ${fmtHours(stats.pathHours)}` : ""}
                    </small>
                  </span>
                  <span role="cell" className="case-progress">
                    <span className="case-bar">
                      <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                    </span>
                    <small>
                      {done}/{total} blocks
                    </small>
                  </span>
                  <span role="cell" className="case-ready">
                    {ready.length ? (
                      ready.slice(0, 2).map((b) => <em key={b.blockId}>{procedure?.blocks.find((x) => x.id === b.blockId)?.name ?? b.blockId}</em>)
                    ) : (
                      <em className="is-muted">—</em>
                    )}
                    {ready.length > 2 ? <em className="is-muted">+{ready.length - 2} more</em> : null}
                  </span>
                  <span role="cell">
                    <mark data-tone={c.status === "complete" ? "ok" : "info"}>{c.status}</mark>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}
