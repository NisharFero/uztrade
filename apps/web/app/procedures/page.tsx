import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "../../components/icons";
import { CATALOGUE, PROCEDURE_IDS, type ProcedureKind } from "../../modules/procedures/data/procedures.generated";
import { fmtRange } from "../../modules/procedures/dag";
import ProcedureFilter from "../../components/procedures/procedure-filter";

export const metadata: Metadata = {
  title: "Procedures · UzTrade",
  description: "The published Uzbek trade procedures this workspace can execute.",
};

const KIND_LABEL: Record<ProcedureKind, string> = {
  customs: "Customs",
  logistics: "Logistics",
  service: "Service",
};

/** The catalogue of every published procedure. A procedure's workflow — its
 *  blocks, steps and inputs — is loaded only when one is opened, so this page
 *  reads the bundled summaries. */
export default function ProceduresPage() {
  const rows = PROCEDURE_IDS.map((id) => CATALOGUE[id]);
  const kinds = rows.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.kind]: (acc[p.kind] ?? 0) + 1 }), {});

  return (
    <>
      <header className="page-head">
        <p>
          <span className="head-icon">{Icon.procedures}</span>
          Procedures
        </p>
        <h1>Supported procedures</h1>
        <p className="page-lede">
          {rows.length} published Uzbek trade procedures: {kinds.customs} customs procedures for particular goods,{" "}
          {kinds.logistics} for arranging transport of any cargo, and {kinds.service} for obtaining a single document or
          registering a contract. Open one to see its dependency graph — the order of work, what is delegated to you, the
          agent or physical handling, and how long each block is expected to take.
        </p>
      </header>

      <ProcedureFilter
        rows={rows.map((p) => ({
          id: p.id,
          title: p.title,
          direction: p.direction,
          goods: p.goods,
          mode: p.mode,
          kind: p.kind,
          kindLabel: KIND_LABEL[p.kind],
          blocks: p.blocksCount,
          steps: p.stepsCount,
          online: p.onlineCount,
          entities: p.entities.length,
          timeframe: fmtRange(p.timeframe),
        }))}
      />
    </>
  );
}
