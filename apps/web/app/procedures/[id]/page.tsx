import Link from "next/link";
import { notFound } from "next/navigation";
import CaseBoard from "../../../components/workflow/case-board";
import CompliancePanel from "../../../components/compliance/compliance-panel";
import Dag from "../../../components/workflow/dag";
import { Icon } from "../../../components/icons";
import { demoFor } from "../../../modules/demo/demo";
import { CATALOGUE } from "../../../modules/procedures/data/procedures.generated";
import { getProcedure } from "../../../modules/procedures/registry";
import type { ShipmentFacts } from "../../../modules/workflow/domain";
import { latestCaseFor } from "../../../modules/cases/current-case";
import { getCase } from "../../../modules/cases/store";
import { parseDocumentState } from "../../../modules/documents/checklist";
import { getPersistedWorkflowDag } from "../../../modules/workflow/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = CATALOGUE[id];
  return { title: p ? `${p.title} · UzTrade` : "Procedure · UzTrade" };
}

/** The procedure, and - when a case runs on it - that case's whole workflow:
 *  DAG, documents, risk and ledger. The current step lives in the chat. */
export default async function ProcedurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const procedure = await getProcedure(id);
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
        {demoFor(procedure.id) ? (
          <p className="page-lede">
            <Link className="crumb" href={`/demo/${procedure.id}`}>
              Demo pack — invented documents and values for every step →
            </Link>
          </p>
        ) : null}
      </header>

      {live ? (
        <CaseBoard
          key={`${live.id}:${workflow?.progress.completed ?? 0}`}
          caseId={live.id}
          procedureId={live.procedureId}
          publishedProcedure={procedure}
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
