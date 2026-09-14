import { Icon } from "../icons";
import type { Procedure } from "../data/procedures.generated";
import type { ShipmentFacts } from "../domain/workflow";
import { fmtRange } from "../lib/dag";
import { buildShipmentPlan, countryName, fmtTonnes, type Hours } from "../lib/shipment-plan";

/** Days for anything multi-day: hour precision on a three-week transit is
 *  false precision. Short ranges keep the hours. */
const fmtSpan = (h: Hours) => (h[0] < 48 ? fmtRange(h) : `${Math.round(h[0] / 24)}–${Math.round(h[1] / 24)} days`);

/** What this shipment's quantity and distance do to the published procedure:
 *  how many wagons or pallets, which blocks take longer because of it, the
 *  transit corridor, and a door-to-door estimate. Pure render - the plan is
 *  derived from the case's own facts every time. */
export default function ShipmentPlanPanel({
  procedure,
  facts,
  query,
}: {
  procedure: Procedure;
  facts: ShipmentFacts;
  query?: string;
}) {
  const plan = buildShipmentPlan(procedure, facts, query);
  const { route, units } = plan;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const byMode = procedure.mode === "air" ? "air" : "rail";
  const goods = procedure.goods;

  const title = [
    plan.tonnes != null ? `${fmtTonnes(plan.tonnes)} of ${goods}` : goods[0].toUpperCase() + goods.slice(1),
    route ? `${route.origin.place.name} → ${route.destination.place.name} by ${byMode}` : `by ${byMode}`,
  ].join(" · ");

  const routeSub = !route
    ? "route not placed"
    : procedure.mode === "air"
      ? route.transfers
        ? `by air, ${plural(route.transfers, "transfer")}`
        : "by air, direct"
      : route.via.length
        ? `by rail via ${route.via.map(countryName).join(", ")}`
        : "by rail, direct";

  const kpis = [
    {
      label: "Load",
      value: plan.tonnes != null ? fmtTonnes(plan.tonnes) : "—",
      sub: `${plural(units.count, units.kind)}${units.assumed ? " (assumed)" : ` · ~${units.perUnitT} t each`}`,
    },
    { label: "Distance", value: route ? `~${route.distanceKm.toLocaleString("en-US")} km` : "—", sub: routeSub },
    {
      label: "Borders",
      value: route ? String(route.borders) : "—",
      sub: route?.gaugeBreak ? "incl. a gauge change" : route?.sea ? "plus a sea leg" : "crossings",
    },
    {
      label: "Transit",
      value: route ? fmtSpan(route.transit) : "—",
      sub: procedure.direction === "export" ? "goods moving, after dispatch" : "goods moving, before clearance",
    },
    {
      label: "Paperwork",
      value: fmtRange(plan.paperwork),
      sub: plan.adjustments.length ? `published ${fmtRange(plan.publishedPaperwork)}` : "critical path, as published",
    },
    { label: "Door to door", value: plan.doorToDoor ? fmtSpan(plan.doorToDoor) : "—", sub: "paperwork + transit" },
  ];

  return (
    <section className="plan-panel" aria-label="Shipment plan">
      <div className="section-head">
        <p>
          <span className="head-icon">{Icon.shipments}</span>
          Shipment plan
        </p>
        <h2>{title}</h2>
      </div>

      <ul className="wf-kpis">
        {kpis.map((k) => (
          <li key={k.label}>
            <span className="wf-kpi-label">{k.label}</span>
            <strong>{k.value}</strong>
            <small>{k.sub}</small>
          </li>
        ))}
      </ul>

      {plan.missing.length ? (
        <ul className="plan-missing">
          {plan.missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : null}

      <div className="plan-cols">
        <div className="plan-col">
          <span className="wf-detail-h">What the load changes</span>
          {plan.adjustments.length ? (
            <ul className="plan-adjust">
              {plan.adjustments.map((a) => (
                <li key={a.blockId}>
                  <strong>{a.name}</strong>
                  <span className="plan-adjust-times">
                    <s>{fmtRange(a.published)}</s> → {fmtRange(a.adjusted)}
                  </span>
                  <small>{a.reason}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="plan-empty">
              {plan.tonnes != null
                ? `Fits in one ${units.kind} — the published durations apply as they are.`
                : "Sized as one unit until a quantity is given."}
            </p>
          )}
        </div>

        <div className="plan-col">
          <span className="wf-detail-h">Route and risk</span>
          {plan.notes.length ? (
            <ul className="plan-notes">
              {plan.notes.map((n) => (
                <li key={n.text} data-tone={n.tone}>
                  {n.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="plan-empty">Nothing unusual for this load and route.</p>
          )}
        </div>
      </div>

      <p className="cr-disclaimer">
        Planning assumptions, not a carrier quote: ~30 t of tea per covered wagon (22 t refrigerated produce, 45 t dried
        fruit), rail at 250–450 km a day including marshalling, 12–36 h per border, 1–2 days per gauge change; air at
        ~750 km/h plus 1.5–3.5 days of handling.
      </p>
    </section>
  );
}
