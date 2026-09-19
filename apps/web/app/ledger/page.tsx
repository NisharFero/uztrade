import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Icon } from "../../components/icons";
import CasePicker from "../../components/ledger/case-picker";
import CaseRecords from "../../components/ledger/case-records";
import { LAST_CASE_COOKIE } from "../../modules/cases/last-case";
import { listCases } from "../../modules/cases/store";
import { CATALOGUE } from "../../modules/procedures/data/procedures.generated";
import { getProcedure } from "../../modules/procedures/registry";
import type { ShipmentFacts } from "../../modules/workflow/domain";
import { tailorProcedure } from "../../modules/workflow/tailor";

export const metadata: Metadata = {
  title: "Ledger · UzTrade",
  description: "Ledger and entity API records for each case.",
};

export const dynamic = "force-dynamic";

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  let cases: Awaited<ReturnType<typeof listCases>> = [];
  let error: string | null = null;
  try {
    cases = await listCases();
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load cases";
  }

  const asked = (await searchParams).case;
  const last = (await cookies()).get(LAST_CASE_COOKIE)?.value;
  const lastId = last ? decodeURIComponent(last) : null;
  const selected = cases.find((c) => c.id === asked) ?? cases.find((c) => c.id === lastId) ?? cases[0] ?? null;

  const selectedProcedure = selected ? await getProcedure(selected.procedureId) : null;

  // The case's stored title is the tailored one; the catalogue gives the published name.
  const label = (c: (typeof cases)[number]) => c.title || CATALOGUE[c.procedureId]?.title || c.procedureId;

  return (
    <>
      <header className="page-head">
        <p>
          <span className="head-icon">{Icon.list}</span>
          Ledger
        </p>
        <h1>{selected ? selected.id : "Ledger"}</h1>
      </header>

      {error ? (
        <p className="query-note" data-tone="error">
          {error}
        </p>
      ) : null}

      {!error && !cases.length ? <p className="plan-empty">No cases yet — open one from the dashboard.</p> : null}

      {selected ? <CasePicker cases={cases.map((c) => ({ id: c.id, label: label(c) }))} selected={selected.id} /> : null}

      {selected && selectedProcedure ? (
        <CaseRecords
          key={selected.id}
          caseId={selected.id}
          procedureId={selected.procedureId}
          publishedProcedure={selectedProcedure}
          shipment={factsOf(selected.shipmentFacts) ?? undefined}
          query={selected.query}
        />
      ) : null}
    </>
  );
}

function factsOf(raw: string | null | undefined): ShipmentFacts | null {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" && "goods" in parsed ? (parsed as ShipmentFacts) : null;
  } catch {
    return null;
  }
}
