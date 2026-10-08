import type { Metadata } from "next";
import { Icon } from "../../components/icons";
import { CATALOGUE, PROCEDURE_IDS, type ProcedureKind } from "../../modules/procedures/data/procedures.generated";
import { fmtRange } from "../../modules/procedures/dag";
import { delegationOfStep } from "../../modules/procedures/delegation";
import { getProcedures } from "../../modules/procedures/registry";
import ProcedureFilter from "../../components/procedures/procedure-filter";

export const metadata: Metadata = {
  title: "Procedures · UzOne Trade Platform",
  description: "The published Uzbek trade procedures this workspace can execute.",
};

const KIND_LABEL: Record<ProcedureKind, string> = {
  customs: "Customs",
  logistics: "Logistics",
  service: "Service",
};

/** The catalogue of every published procedure.
 *
 *  The summaries carry everything except who does the work, which is decided
 *  per step by `delegationOfStep`. So the corpus is loaded once here to count
 *  the three lanes per procedure — ~40 ms for all of them, against making a
 *  card that cannot say the one thing a trader wants to know before opening
 *  it: how much of this is mine to do. */
export default async function ProceduresPage() {
  const rows = PROCEDURE_IDS.map((id) => CATALOGUE[id]);

  const split = new Map<string, { user: number; agent: number; physical: number }>();
  try {
    for (const procedure of await getProcedures([...PROCEDURE_IDS])) {
      const tally = { user: 0, agent: 0, physical: 0 };
      for (const block of procedure.blocks)
        for (const step of block.steps) tally[delegationOfStep(step).lane] += 1;
      split.set(procedure.id, tally);
    }
  } catch {
    // Without the corpus the cards simply omit the bar.
  }
  const kinds = rows.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.kind]: (acc[p.kind] ?? 0) + 1 }), {});

  return (
    <>
      <header className="page-head">
        <p data-tint="blue">
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
          split: split.get(p.id) ?? null,
        }))}
      />
    </>
  );
}
