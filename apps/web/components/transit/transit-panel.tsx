"use client";

import { useEffect, useState } from "react";
import { Icon } from "../icons";
import { MILESTONES, MILESTONE_LABEL, type Milestone, type TransitView } from "../../modules/transit/transit";

const hours = (h: number) => (h < 24 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`);

/** Transit & Capacity: what has to move, the capacity and equipment it takes,
 *  where the shipment stands now, the transport references it carries, and
 *  what is holding the movement up. Everything is read from the case — this
 *  agent books nothing itself. */
export default function TransitPanel({ caseId }: { caseId: string }) {
  const [view, setView] = useState<(TransitView & { recorded?: unknown }) | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/cases/${caseId}/transit`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: TransitView) => live && setView(body))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [caseId]);

  if (failed) {
    return (
      <section className="tr-panel" aria-label="Transit and capacity">
        <Head />
        <p className="needs-empty">Movement state is unavailable for this case.</p>
      </section>
    );
  }
  if (!view) {
    return (
      <section className="tr-panel" aria-label="Transit and capacity">
        <Head />
        <p className="needs-empty">Reading the movement plan…</p>
      </section>
    );
  }

  const { capacity, route, status, legs, references, exceptions } = view;
  const reached = MILESTONES.indexOf(status.milestone);

  return (
    <section className="tr-panel" aria-label="Transit and capacity">
      <Head />

      <div className="tr-status" data-milestone={status.milestone}>
        <div>
          <span className="wf-detail-h">Where the shipment is</span>
          <strong>{status.label}</strong>
          <small>
            {status.reachedStep ? `reached at step ${status.reachedStep}` : "nothing has moved yet"} · {status.done}/{status.total} movement steps
          </small>
        </div>
        {status.next ? (
          <p className="tr-next">
            Next: <strong>step {status.next.stepNum}</strong> — {status.next.title}
            <small>
              {status.next.entity} · {status.next.lane === "agent" ? "the agent files it" : status.next.lane === "physical" ? "at the goods" : "yours to do"}
            </small>
          </p>
        ) : (
          <p className="tr-next">Every movement step is complete.</p>
        )}
      </div>

      <ol className="tr-track" aria-label="Movement milestones">
        {MILESTONES.map((m: Milestone, i) => (
          <li key={m} data-state={i < reached ? "done" : i === reached ? "now" : "ahead"} title={MILESTONE_LABEL[m]}>
            <span />
            <small>{MILESTONE_LABEL[m]}</small>
          </li>
        ))}
      </ol>

      <div className="tr-grid">
        <div>
          <span className="wf-detail-h">Capacity</span>
          <strong>
            {capacity.declared ?? capacity.units.count} × {capacity.units.kind}
          </strong>
          <small>
            {capacity.tonnes != null ? `${capacity.tonnes} t net` : "quantity not stated"}
            {capacity.grossTonnes != null ? ` · ${capacity.grossTonnes} t gross` : ""} · ~{capacity.units.perUnitT} t per unit
            {capacity.declared != null && capacity.declared !== capacity.units.count ? ` · load needs ${capacity.units.count}` : ""}
          </small>
        </div>
        <div>
          <span className="wf-detail-h">Equipment</span>
          <strong>{capacity.equipment.split("—")[0].trim()}</strong>
          <small>{capacity.equipment.includes("—") ? capacity.equipment.split("—").slice(1).join("—").trim() : `by ${view.mode}`}</small>
        </div>
        {route ? (
          <div>
            <span className="wf-detail-h">Route</span>
            <strong>
              {route.origin} → {route.destination}
            </strong>
            <small>
              {route.distanceKm ? `≈${route.distanceKm.toLocaleString("en-US")} km` : ""}
              {route.borders ? ` · ${route.borders} border${route.borders === 1 ? "" : "s"}` : ""}
              {route.via.length ? ` · via ${route.via.join(", ")}` : ""}
              {route.transitHours ? ` · transit ${hours(route.transitHours[0])}–${hours(route.transitHours[1])}` : ""}
            </small>
          </div>
        ) : null}
      </div>

      <div className="tr-columns">
        <div className="tr-legs">
          <span className="wf-detail-h">How it moves</span>
          <ol>
            {legs.map((leg) => (
              <li key={leg.id} data-state={leg.state}>
                <strong>{leg.title}</strong>
                <small>
                  {leg.place}
                  {leg.steps.length ? ` · step${leg.steps.length > 1 ? "s" : ""} ${leg.steps.join(", ")}` : " · no step in this procedure"}
                </small>
              </li>
            ))}
          </ol>
        </div>

        {references.length ? (
          <div className="tr-refs">
            <span className="wf-detail-h">Transport references</span>
            <ul>
              {references.map((r) => (
                <li key={`${r.label}:${r.value}`}>
                  <em>{r.label}</em>
                  <code>{r.value}</code>
                  <small>{r.from}</small>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="tr-exceptions">
          <span className="wf-detail-h">Movement exceptions</span>
          {exceptions.length ? (
            <ul>
              {exceptions.map((e, i) => (
                <li key={`${e.title}:${i}`} data-severity={e.severity}>
                  <strong>
                    {e.title}
                    {e.stepNum ? ` · step ${e.stepNum}` : ""}
                  </strong>
                  <small>
                    {e.detail}
                    {e.handOff === "risk" ? " — handed to Compliance & Risk." : ""}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="needs-empty">Nothing is blocking the movement.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Head() {
  return (
    <div className="section-head">
      <p>
        <span className="head-icon" data-tint="amber">
          {Icon.shipments}
        </span>
        Transit &amp; Capacity
      </p>
      <h2>Movement &amp; transport</h2>
    </div>
  );
}
