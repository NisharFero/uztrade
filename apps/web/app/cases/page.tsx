import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "../../components/icons";
import CaseList, { type CaseRowData } from "../../components/cases/case-list";
import { CATALOGUE } from "../../modules/procedures/data/procedures.generated";
import { getProcedures } from "../../modules/procedures/registry";
import { listCases } from "../../modules/cases/store";
import { fmtHours, procedureStats } from "../../modules/procedures/dag";
import type { ShipmentFacts } from "../../modules/workflow/domain";
import { tailorProcedure } from "../../modules/workflow/tailor";

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

  // One workflow per distinct procedure among the cases shown, not per case.
  const loaded = new Map((await getProcedures([...new Set(cases.map((c) => c.procedureId))])).map((p) => [p.id, p]));
  const rows: CaseRowData[] = cases.map((c) => {
    const procedure = loaded.get(c.procedureId);
    const stats = procedure ? procedureStats(procedure) : null;
    const tailored = procedure ? tailorProcedure(procedure, factsOf(c.shipmentFacts), c.query) : null;
    return {
      id: c.id,
      title: tailored?.title ?? c.title,
      line: tailored?.shipment.line ?? "",
      procedureId: c.procedureId,
      plan: stats ? fmtHours(stats.pathHours) : null,
      done: c.blocks.filter((b) => b.state === "done").length,
      total: procedure?.blocks.length ?? c.blocks.length,
      ready: c.blocks.filter((b) => b.state === "running").map((b) => procedure?.blocks.find((x) => x.id === b.blockId)?.name ?? b.blockId),
      status: c.status,
    };
  });

  return (
    <>
      <header className="page-head">
        <p>
          <span className="head-icon">{Icon.shipments}</span>
          Cases &amp; Shipments
        </p>
        <h1>All cases</h1>
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

      {cases.length ? <CaseList rows={rows} /> : null}
    </>
  );
}

function factsOf(raw: string | null | undefined): Partial<ShipmentFacts> | null {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
