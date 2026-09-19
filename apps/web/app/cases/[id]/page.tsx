import Link from "next/link";
import { notFound } from "next/navigation";
import CaseBoard from "../../../components/workflow/case-board";
import RememberCase from "../../../components/cases/remember-case";
import CaseUpfront from "../../../components/cases/case-upfront";
import { getProcedure } from "../../../modules/procedures/registry";
import { getCase } from "../../../modules/cases/store";
import { parseDocumentState } from "../../../modules/documents/checklist";
import type { ShipmentFacts } from "../../../modules/workflow/domain";
import { getPersistedWorkflowDag } from "../../../modules/workflow/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `${id} · UzTrade` };
}

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getCase(id);
  if (!found) notFound();

  const procedure = await getProcedure(found.procedureId);
  if (!procedure) notFound();

  const progress = Object.fromEntries(
    found.blocks.map((b) => [
      b.blockId,
      { state: b.state as "waiting" | "blocked" | "running" | "done", actualHours: b.actualHours },
    ]),
  );
  const shipment = parseShipmentFacts(found.shipmentFacts);
  const workflow = found.workflowRunId ? await getPersistedWorkflowDag(found.workflowRunId) : undefined;

  return (
    <>
      <header className="page-head">
        <p>
          <Link href="/cases" className="crumb">
            Cases &amp; Shipments
          </Link>{" "}
          · procedure{" "}
          <Link className="crumb" href={`/procedures/${found.procedureId}`}>
            {found.procedureId}
          </Link>
        </p>
        <h1>{found.id}</h1>
        <p className="page-lede">
          <Link className="crumb" href="/">
            Steps on the dashboard
          </Link>{" "}
          ·{" "}
          <Link className="crumb" href={`/ledger?case=${encodeURIComponent(found.id)}`}>
            Ledger &amp; entity API records
          </Link>
        </p>
      </header>

      <RememberCase caseId={found.id} />

      <CaseUpfront caseId={found.id} procedureId={found.procedureId} />

      {/* Remounts after each step so the workflow below reflects it. */}
      <CaseBoard
        key={`${found.id}:${workflow?.progress.completed ?? 0}:${found.documentState.length}`}
        caseId={found.id}
        procedureId={found.procedureId}
        publishedProcedure={procedure}
        initialProgress={progress}
        initialDocumentState={parseDocumentState(found.documentState)}
        initialWorkflow={workflow}
        shipment={shipment ?? undefined}
        query={found.query}
      />
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
