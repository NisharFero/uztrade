import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "../../components/icons";
import { laneBreakdown } from "../../modules/procedures/delegation";
import { PROCEDURE_IDS, PROCEDURES } from "../../modules/procedures/data/procedures.generated";
import { assessCompliance } from "../../modules/compliance/compliance";
import { fmtHours, fmtRange, procedureStats } from "../../modules/procedures/dag";

export const metadata: Metadata = {
  title: "Procedures · UzTrade",
  description: "The trade procedures this workspace can execute.",
};

export default function ProceduresPage() {
  return (
    <>
      <header className="page-head">
        <p>
          <span className="head-icon">{Icon.procedures}</span>
          Procedures
        </p>
        <h1>Supported procedures</h1>
        <p className="page-lede">
          Five published Uzbek trade procedures. Each one is a dependency graph of blocks —
          open a procedure to see the order of work, what the orchestrator delegates to you,
          the agent, or physical handling, and how long each block is expected to take.
        </p>
      </header>

      <div className="proc-grid">
        {PROCEDURE_IDS.map((id) => {
          const p = PROCEDURES[id];
          const stats = procedureStats(p);
          const mix = laneBreakdown(p.blocks).filter((a) => a.count > 0);
          const compliance = assessCompliance(p);

          return (
            <Link className="proc-card" href={`/procedures/${id}`} key={id}>
              <div className="proc-card-head">
                <span className="proc-id">{id}</span>
                <span className="proc-mode" data-mode={p.mode}>
                  {p.direction} · {p.mode}
                </span>
              </div>
              <h2>{p.title}</h2>

              <dl className="proc-stats">
                <div>
                  <dt>Blocks</dt>
                  <dd>{p.blocks.length}</dd>
                </div>
                <div>
                  <dt>Steps</dt>
                  <dd>{p.stepsCount}</dd>
                </div>
                <div>
                  <dt>Published</dt>
                  <dd>{fmtRange(p.timeframe)}</dd>
                </div>
                <div>
                  <dt>Critical path</dt>
                  <dd>{fmtHours(stats.pathHours)}</dd>
                </div>
              </dl>

              {/* Delegation: what the orchestrator hands to whom, by share of steps. */}
              <div className="proc-mix" aria-label="Delegation mix">
                {mix.map((a) => (
                  <span key={a.id} data-lane={a.id} style={{ flexGrow: a.count }} title={`${a.label}: ${a.pct}%`} />
                ))}
              </div>
              <div className="proc-mix-key">
                {mix.map((a) => (
                  <span key={a.id} data-lane={a.id}>
                    {a.label} {a.pct}%
                  </span>
                ))}
              </div>

              <div className="proc-hs" title="AI-suggested classification — confirm before filing">
                HS {compliance.hsCode} · {compliance.riskFlags.length} risk flag
                {compliance.riskFlags.length === 1 ? "" : "s"}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
