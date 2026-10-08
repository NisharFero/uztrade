import type { Metadata } from "next";
import { Icon } from "../../components/icons";
import { listCases } from "../../modules/cases/store";
import { getProcedures } from "../../modules/procedures/registry";
import { allPlaces, buildShipmentPlan } from "../../modules/intake/shipment-plan";
import { corridorOf, inspectionsOf } from "../../modules/map/corridor";
import { delegationOfStep } from "../../modules/procedures/delegation";
import type { ShipmentFacts } from "../../modules/workflow/domain";
import WorldMap, { type MapCase } from "../../components/map/world-map";

export const metadata: Metadata = {
  title: "Tracking · UzOne Trade Platform",
  description: "Every open case on its corridor, and where each shipment stands.",
};
export const dynamic = "force-dynamic";

function factsOf(raw: string | null | undefined): ShipmentFacts {
  const empty: ShipmentFacts = { goods: "", quantity: null, unit: null, origin: null, destination: null, mode: null };
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? { ...empty, ...parsed } : empty;
  } catch {
    return empty;
  }
}

/* Every case on one map.
 *
 * The geometry is computed here, on the server, because it comes from pure
 * functions over the corpus — `buildShipmentPlan` resolves the route and
 * `corridorOf` turns it into a chain of points. The client gets plain
 * coordinates and asks the existing `/api/cases/:id/transit` endpoint where
 * each shipment stands. Nothing new was added to the backend for this page: no
 * table, no route, no schema.
 *
 * The positions are MODELLED from the corridor and the case's transit
 * milestone. There is no carrier telemetry behind this product, and the page
 * says so rather than implying a live feed. */
export default async function MapPage() {
  let cases: Awaited<ReturnType<typeof listCases>> = [];
  let error: string | null = null;
  try {
    cases = await listCases();
  } catch (reason) {
    error = reason instanceof Error ? reason.message : "Could not load cases";
  }

  const procedures = new Map(
    (await getProcedures([...new Set(cases.map((c) => c.procedureId))])).map((p) => [p.id, p]),
  );

  const mapped: MapCase[] = [];
  const unplaceable: { id: string; title: string; why: string }[] = [];

  for (const c of cases) {
    const procedure = procedures.get(c.procedureId);
    if (!procedure) {
      unplaceable.push({ id: c.id, title: c.title, why: "its procedure is not in this build" });
      continue;
    }
    const facts = factsOf(c.shipmentFacts);
    const plan = buildShipmentPlan(procedure, facts, c.query);
    const route = plan.route;
    const corridor = route && corridorOf(route);
    if (!route || !corridor) {
      unplaceable.push({ id: c.id, title: c.title, why: "no route was named when it was opened" });
      continue;
    }
    const total = c.blocks.length || 1;
    mapped.push({
      id: c.id,
      title: c.title,
      goods: facts.goods || procedure.goods,
      mode: route.mode,
      corridor,
      transitHours: route.transit,
      blocksDone: c.blocks.filter((b) => b.state === "done").length,
      blocksTotal: total,
      // What the cargo is actually carried in. The planner yields wagons,
      // trucks and air pallets; it has no container unit.
      units: { kind: plan.units.kind, count: plan.units.count, perUnitT: plan.units.perUnitT, assumed: plan.units.assumed },
      tonnes: plan.tonnes,
      // What the trader actually said they were moving.
      declared: { quantity: facts.quantity, unit: facts.unit },
      /* Where a person has to be present. Every one is a published step whose
         lane is physical, carrying the facility the procedure names. */
      /* The procedure's own blocks, with what the case has done to each.
         Dates are real: `started_at` and `completed_at` are written when a
         block moves. */
      blocks: procedure.blocks.map((b) => {
        const row = c.blocks.find((x) => x.blockId === b.id);
        return {
          id: b.id,
          name: b.name,
          steps: b.steps.length,
          state: row?.state ?? "waiting",
          startedAt: row?.startedAt ?? null,
          completedAt: row?.completedAt ?? null,
          actualHours: row?.actualHours ?? null,
          estimate: b.estDuration,
        };
      }),
      /* Where money is due. These are published steps, so the WHAT and the
         WHO are real; nothing in the corpus publishes an amount, so none is
         shown — a figure only appears once an invoice carrying one is in the
         case's ledger. */
      charges: procedure.blocks.flatMap((b) =>
        b.steps
          .filter((s) => /pay/i.test(s.channel))
          .map((s) => ({ stepNum: s.num, title: s.title, entity: s.entity, channel: s.channel, blockId: b.id })),
      ),
      inspections: inspectionsOf(
        procedure.blocks.flatMap((b) =>
          b.steps.map((s) => ({ num: s.num, title: s.title, where: s.where, entity: s.entity, lane: delegationOfStep(s).lane })),
        ),
      ),
    });
  }

  return (
    <>
      <header className="page-head">
        <p data-tint="cyan">
          <span className="head-icon">{Icon.route}</span>
          Where everything is
        </p>
        <h1>Tracking</h1>
        <p className="page-lede">
          {mapped.length} {mapped.length === 1 ? "case" : "cases"} on their corridors. Positions are modelled from the
          published corridor and each case&rsquo;s transit milestone — this platform has no carrier telemetry, so a
          marker says &ldquo;departed, not yet at the border&rdquo;, never a GPS fix.
        </p>
      </header>

      {error ? (
        <p className="query-note" data-tone="error">
          <span className="head-icon">{Icon.clock}</span>
          {error}
        </p>
      ) : null}

      {mapped.length ? (
        /* Every place the gazetteer knows, so the map names cities a route
           does not happen to pass through and reads as a map. */
        <WorldMap cases={mapped} places={allPlaces().map((p) => ({ name: p.name, at: [p.lon, p.lat] as [number, number] }))} />
      ) : (
        <p className="ent-hint">
          <span className="head-icon">{Icon.sparkle}</span>
          No case has a route to draw yet. Open one with an origin and a destination and it appears here.
        </p>
      )}

      {unplaceable.length ? (
        <section className="map-unplaced" aria-label="Cases without a corridor">
          <p className="wf-detail-h">
            {unplaceable.length} {unplaceable.length === 1 ? "case is" : "cases are"} not on the map
          </p>
          <ul>
            {unplaceable.map((u) => (
              <li key={u.id}>
                <strong>{u.id}</strong> {u.title} — {u.why}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
