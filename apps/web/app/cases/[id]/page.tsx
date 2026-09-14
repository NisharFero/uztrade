import Link from "next/link";
import { notFound } from "next/navigation";
import CaseBoard from "../../../components/workflow/case-board";
import StepAssistant from "../../../components/chat/step-assistant";
import RememberCase from "../../../components/cases/remember-case";
import { PROCEDURES } from "../../../modules/procedures/data/procedures.generated";
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

  const procedure = PROCEDURES[found.procedureId];
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
          · {found.id}
        </p>
        <h1>{found.title}</h1>
        <p className="page-lede">
          Opened from: &ldquo;{found.query}&rdquo; — matched to procedure{" "}
          <Link className="crumb" href={`/procedures/${found.procedureId}`}>
            {found.procedureId}
          </Link>{" "}
          by {found.matchedBy === "llm" ? "the classifier" : "keyword rules"}.
        </p>
      </header>

      <RememberCase caseId={found.id} />
      <StepAssistant caseId={found.id} />

      {/* Remounts after each step so the workflow below reflects it. */}
      <CaseBoard
        key={`${found.id}:${workflow?.progress.completed ?? 0}:${found.documentState.length}`}
        caseId={found.id}
        procedureId={found.procedureId}
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
