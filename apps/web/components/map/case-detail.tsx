"use client";

import { Icon } from "../icons";
import { cargoOf, GLYPH, type Inspection } from "../../modules/map/corridor";
import { MILESTONES, MILESTONE_LABEL, type Milestone } from "../../modules/transit/transit";
import type { MapCase } from "./world-map";

/* One case, opened.
 *
 * Four views of the same shipment: where it is, what it has reached, what the
 * procedure still wants, and where money is due. Each is built from something
 * the case actually holds — the corridor, the transit milestone, the case's
 * own block rows with their timestamps, and the published payment steps.
 *
 * The charge view is the one to be careful with. Nothing in this corpus
 * publishes a price, so it lists what a case WILL be charged for and by whom,
 * and says plainly that a figure only appears once an invoice carrying one is
 * in the ledger. It never estimates a cost. */

export type DetailTab = "map" | "milestones" | "checklist" | "charges";
export const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "milestones", label: "Milestones" },
  { id: "checklist", label: "Checklist" },
  { id: "charges", label: "Charge points" },
];

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

const hours = (h: number | null) => (h == null ? null : h < 1 ? "<1 h" : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`);

export default function CaseDetail({
  kase,
  milestone,
  tab,
  onTab,
  onClose,
  map,
}: {
  kase: MapCase;
  milestone: Milestone | null;
  tab: DetailTab;
  onTab: (t: DetailTab) => void;
  onClose: () => void;
  /** The map, rendered by the parent so it keeps its pan, zoom and selection. */
  map: React.ReactNode;
}) {
  const reached = MILESTONES.indexOf(milestone ?? "planned");
  const done = kase.blocks.filter((b) => b.state === "done").length;
  const cargo = cargoOf(kase.declared, kase.units);
  const first = kase.corridor.waypoints[0];
  const last = kase.corridor.waypoints[kase.corridor.waypoints.length - 1];
  const paid = new Set(kase.blocks.filter((b) => b.state === "done").map((b) => b.id));

  return (
    <section className="cd" aria-label={`${kase.id} detail`}>
      <header className="cd-head">
        <button type="button" className="cd-back" onClick={onClose}>
          ← All shipments
        </button>
        <div className="cd-title">
          <span className="cd-glyph" aria-hidden="true">
            {GLYPH[kase.corridor.segments[0]?.kind ?? "rail"] === "ship"
              ? Icon.ship
              : GLYPH[kase.corridor.segments[0]?.kind ?? "rail"] === "plane"
                ? Icon.plane
                : GLYPH[kase.corridor.segments[0]?.kind ?? "rail"] === "truck"
                  ? Icon.truck
                  : Icon.train}
          </span>
          <div>
            <h2>{kase.title}</h2>
            <p>
              {kase.id} · {first.name.replace(/ · .*/, "")} → {last.name.replace(/ · .*/, "")} ·{" "}
              {kase.corridor.distanceKm.toLocaleString("en-US")} km · {cargo.label}
            </p>
          </div>
          <span className="cd-state">{MILESTONE_LABEL[milestone ?? "planned"]}</span>
        </div>

        <div className="cd-tabs" role="tablist" aria-label="Case views">
          {DETAIL_TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-on={tab === t.id} onClick={() => onTab(t.id)}>
              {t.label}
              {t.id === "checklist" ? <em>{done} of {kase.blocks.length}</em> : null}
              {t.id === "charges" ? <em>{kase.charges.length}</em> : null}
            </button>
          ))}
        </div>
      </header>

      {tab === "map" ? (
        <div className="cd-map">
          {map}
          {kase.corridor.segments.some((s) => s.kind === "air") ? (
            <p className="cd-lede">
              <span className="head-icon">{Icon.sparkle}</span>
              Flown direct. The arc runs city to city — the gazetteer holds cities, not airports, so this is the pair
              rather than the runways.
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === "milestones" ? (
        <ol className="cd-miles">
          {MILESTONES.map((m, i) => {
            const state = i < reached ? "done" : i === reached ? "now" : "ahead";
            return (
              <li key={m} data-state={state}>
                <span className="cd-dot" aria-hidden="true" />
                <span className="cd-mile-body">
                  <strong>{MILESTONE_LABEL[m]}</strong>
                  <small>{state === "done" ? "Reached" : state === "now" ? "Where the case stands" : "Not yet"}</small>
                </span>
              </li>
            );
          })}
          <li className="cd-note" data-state="note">
            Milestones come from the case&rsquo;s own steps. The position they put on the map is modelled from the
            corridor — this platform has no carrier feed.
          </li>
        </ol>
      ) : null}

      {tab === "checklist" ? (
        <div className="cd-list">
          <p className="cd-lede">
            {done} of {kase.blocks.length} blocks complete · {kase.blocks.reduce((n, b) => n + b.steps, 0)} published
            steps in this procedure.
          </p>
          <ol className="cd-blocks">
            {kase.blocks.map((b) => (
              <li key={b.id} data-state={b.state}>
                <span className="cd-dot" aria-hidden="true" />
                <span className="cd-block-body">
                  <strong>{b.name}</strong>
                  <small>
                    {b.steps} {b.steps === 1 ? "step" : "steps"}
                    {b.startedAt ? ` · started ${when(b.startedAt)}` : ""}
                    {b.completedAt ? ` · done ${when(b.completedAt)}` : ""}
                    {b.actualHours != null ? ` · took ${hours(b.actualHours)}` : ` · published ${Math.round(b.estimate[0])}–${Math.round(b.estimate[1])} h`}
                  </small>
                </span>
                <span className="cd-pill" data-state={b.state}>
                  {b.state}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {tab === "charges" ? (
        <div className="cd-list">
          <p className="cd-lede">
            <span className="head-icon">{Icon.sparkle}</span>
            {kase.charges.length} points where this procedure takes a payment. Nothing published states an amount, so
            none is shown — a figure appears only when an invoice carrying one is in this case&rsquo;s ledger.
          </p>
          <ol className="cd-charges">
            {kase.charges.map((ch) => (
              <li key={ch.stepNum} data-paid={paid.has(ch.blockId) ? "true" : "false"}>
                <span className="cd-charge-step">{ch.stepNum}</span>
                <span className="cd-block-body">
                  <strong>{ch.title}</strong>
                  <small>
                    {ch.entity} · {ch.channel}
                  </small>
                </span>
                <span className="cd-pill" data-state={paid.has(ch.blockId) ? "done" : "waiting"}>
                  {paid.has(ch.blockId) ? "block done" : "due"}
                </span>
              </li>
            ))}
          </ol>
          {kase.charges.length === 0 ? <p className="cd-empty">This procedure takes no payment of its own.</p> : null}
        </div>
      ) : null}
    </section>
  );
}

export type { Inspection };
