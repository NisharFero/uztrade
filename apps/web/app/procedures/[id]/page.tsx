import Link from "next/link";
import { notFound } from "next/navigation";
import CaseBoard from "../../components/case-board";
import CompliancePanel from "../../components/compliance-panel";
import Dag from "../../components/dag";
import { Icon } from "../../icons";
import { PROCEDURES } from "../../data/procedures.generated";
import type { ShipmentFacts } from "../../domain/workflow";
import { latestCaseFor } from "../../lib/active-case";
import { getCase } from "../../lib/case-store";
import { parseDocumentState } from "../../lib/document-intelligence";
import { getPersistedWorkflowDag } from "../../lib/workflow-service";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = PROCEDURES[id];
  return { title: p ? `${p.title} · UzTrade` : "Procedure · UzTrade" };
}

/** The procedure, and - when a case runs on it - that case's whole workflow:
 *  DAG, documents, risk and ledger. The current step lives in the chat. */
export default async function ProcedurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const procedure = PROCEDURES[id];
  if (!procedure) notFound();

  let live: Awaited<ReturnType<typeof getCase>> = null;
  try {
    const latest = await latestCaseFor(id);
    live = latest ? await getCase(latest.id) : null;
  } catch {
    live = null; // no database - show the template
  }
  const workflow = live?.workflowRunId ? await getPersistedWorkflowDag(live.workflowRunId) : undefined;
  const progress = live
    ? Object.fromEntries(
        live.blocks.map((b) => [b.blockId, { state: b.state as "waiting" | "blocked" | "running" | "done", actualHours: b.actualHours }]),
      )
    : {};

  return (
    <>
      <header className="page-head">
        <p>
          <Link href="/procedures" className="crumb">
            Procedures
          </Link>{" "}
          · {procedure.id}
        </p>
        <h1>{procedure.title}</h1>
        {live ? (
          <p className="page-lede">
            Case{" "}
            <Link className="crumb" href={`/cases/${live.id}`}>
              {live.id}
            </Link>{" "}
            — {live.status === "complete" ? "complete" : "in progress"} · opened from &ldquo;{live.query}&rdquo;.{" "}
            {live.status === "complete" ? null : (
              <Link className="crumb" href="/">
                Current step in the chat →
              </Link>
            )}
          </p>
        ) : null}
      </header>

      {live ? (
        <CaseBoard
          key={`${live.id}:${workflow?.progress.completed ?? 0}`}
          caseId={live.id}
          procedureId={live.procedureId}
          initialProgress={progress}
          initialDocumentState={parseDocumentState(live.documentState)}
          initialWorkflow={workflow}
          shipment={parseShipmentFacts(live.shipmentFacts) ?? undefined}
          query={live.query}
        />
      ) : (
        <>
          {/* No progress prop: this is the template view, not a live case. */}
          <Dag procedure={procedure} />
          <CompliancePanel procedure={procedure} />
        </>
      )}

      <section className="mini-panel" aria-label="Entity directory">
        <div className="section-head">
          <p>
            <span className="head-icon" data-tint="teal">
              {Icon.documents}
            </span>
            Directory
          </p>
          <h2>Bodies you will deal with</h2>
        </div>
        <div className="dir-list">
          {procedure.entityDirectory.map((e) => (
            <article className="dir-row" key={e.name}>
              <div>
                <strong>{e.name}</strong>
                <small>steps {e.steps}</small>
              </div>
              {e.contact ? <span className="dir-contact">{e.contact}</span> : null}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function parseShipmentFacts(raw: string | null | undefined): ShipmentFacts | null {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" && "goods" in parsed ? (parsed as ShipmentFacts) : null;
  } catch {
    return null;
  }
}
