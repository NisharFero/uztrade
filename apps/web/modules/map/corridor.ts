/* Corridor geometry for the live map.
 *
 * A published procedure says nothing about where a shipment physically is, and
 * nothing in this product talks to a carrier's telemetry. What it does know is
 * the corridor — origin, the countries a leg passes through, the border count,
 * the modelled distance and transit band — and which transit milestone the case
 * has reached. This turns those two into a point to draw.
 *
 * So the position is MODELLED, not tracked, and every caller has to say so:
 * `Placement.basis` carries the milestone it was derived from and the UI prints
 * it beside the marker. The marker never claims more precision than "this case
 * has departed and not yet reached the border".
 *
 * Pure: no React, no fetch, no DB. `pointAt` walks the great-circle chain with
 * d3-geo's interpolator, which is the same geodesic the map draws, so a marker
 * always sits on its own line. */

import { geoDistance, geoInterpolate } from "d3-geo";
import { countryName, hubOf, placesIn, type Place, type Route } from "../intake/shipment-plan";
import type { Milestone } from "../transit/transit";

/** [lon, lat] — the order d3-geo and GeoJSON use, not lat/lon. */
export type LngLat = [number, number];

export type Waypoint = { name: string; country: string; at: LngLat };

export type Segment = {
  from: Waypoint;
  to: Waypoint;
  /** How the cargo covers this leg. A corridor that declares a sea or road
   *  leg carries it on its last approach, which is where those legs sit in
   *  RAIL_CORRIDORS ("Caspian ferry Turkmenbashi → Baku"). */
  kind: "rail" | "road" | "air" | "sea";
  /** True when the two ends are in different countries. */
  border: boolean;
  /** Share of the whole corridor this segment covers, 0–1. */
  share: number;
};

export type Corridor = {
  waypoints: Waypoint[];
  segments: Segment[];
  /** Cumulative share at each waypoint, 0 at the origin and 1 at the end. */
  marks: number[];
  /** Fraction of the corridor at each border, in order. */
  borders: number[];
  distanceKm: number;
  /** The corridor's own words for an unusual leg, worth printing. */
  notes: { sea: string | null; road: string | null; gaugeBreak: string | null };
};

export type Placement = {
  at: LngLat;
  fraction: number;
  /** Which segment the point falls on, for choosing the glyph. */
  segment: Segment | null;
  /** The milestone this was derived from — the claim the UI should make. */
  basis: Milestone;
  moving: boolean;
};

/* ------------------------------------------------------------- geometry --- */

const point = (p: Place): LngLat => [p.lon, p.lat];

/** Great-circle length in km, for weighting the chain. R is d3's unit sphere. */
const km = (a: LngLat, b: LngLat) => geoDistance(a, b) * 6371;

/** The chain a shipment follows: origin, each `via` country's hub, destination.
 *  Returns null when either end is not a place the gazetteer knows, which is
 *  the same condition intake declines on. */
export function corridorOf(route: Route): Corridor | null {
  const origin = route.origin?.place;
  const destination = route.destination?.place;
  if (!origin || !destination) return null;

  const waypoints: Waypoint[] = [{ name: origin.name, country: origin.country, at: point(origin) }];
  for (const code of route.via) {
    const hub = hubOf(code);
    // A corridor country with no hub in the gazetteer is skipped rather than
    // guessed at; the line then runs straight through it.
    if (hub) waypoints.push({ name: `${hub.name} · ${countryName(code)}`, country: code, at: point(hub) });
  }
  waypoints.push({ name: destination.name, country: destination.country, at: point(destination) });

  /* A ferry starts at a port, not at the country's freight hub. The note says
     "Caspian ferry Turkmenbashi → Baku", and Ashgabat — Turkmenistan's hub and
     the waypoint the corridor would otherwise use — is inland, so the crossing
     was being drawn from the wrong place and the rail run to the coast was
     missing entirely. Where the note names a port the gazetteer knows, it is
     inserted and the special leg begins there. */
  const special = new Map<string, Segment["kind"]>();
  for (const [note, kind] of [[route.sea, "sea"] as const, [route.road, "road"] as const]) {
    if (!note) continue;
    const at = legNamedBy(waypoints, note);
    if (at < 0) continue;
    const port = portIn(note, waypoints[at].country);
    // Compare position, not label: a hub waypoint carries a decorated name
    // ("Ashgabat · Turkmenistan") that never equals the gazetteer's.
    if (port && (port.lon !== waypoints[at].at[0] || port.lat !== waypoints[at].at[1])) {
      waypoints.splice(at + 1, 0, { name: port.name, country: port.country, at: point(port) });
      special.set(waypoints[at + 1].name, kind);
    } else {
      special.set(waypoints[at].name, kind);
    }
  }

  const legs = waypoints.slice(0, -1).map((from, i) => ({ from, to: waypoints[i + 1] }));
  if (!legs.length) return null;

  const lengths = legs.map((l) => km(l.from.at, l.to.at));
  const total = lengths.reduce((a, c) => a + c, 0) || 1;

  const base: Segment["kind"] = route.mode === "air" ? "air" : route.mode === "road" ? "road" : "rail";
  const segments: Segment[] = legs.map((l, i) => ({
    ...l,
    kind: special.get(l.from.name) ?? base,
    border: l.from.country !== l.to.country,
    share: lengths[i] / total,
  }));

  const marks = [0];
  for (const s of segments) marks.push(marks[marks.length - 1] + s.share);
  marks[marks.length - 1] = 1;

  // A border sits where the countries change; drawn at that segment's midpoint,
  // because the corridor says which countries are crossed, not where the post is.
  const borders = segments.flatMap((s, i) => (s.border ? [marks[i] + s.share / 2] : []));

  return {
    waypoints,
    segments,
    marks,
    borders,
    distanceKm: route.distanceKm,
    notes: { sea: route.sea, road: route.road, gaugeBreak: route.gaugeBreak },
  };
}

/* Which leg a corridor note is about.
 *
 * The note names its own places — "Caspian ferry Turkmenbashi → Baku", "Sea
 * leg Bandar Abbas → Jebel Ali", "road leg from Hairatan" — so the leg is the
 * one running between the countries those places are in.
 *
 * This used to assume the note always described the final approach. That is
 * true for Dubai, Mumbai and Seoul by coincidence, and wrong for Georgia: the
 * Caspian crossing is Turkmenistan to Azerbaijan, two legs from the end, so a
 * railway was being drawn across the sea while the overland run from Baku to
 * Tbilisi was drawn as a ferry. The last leg is now only the fallback, for a
 * note that names nowhere the gazetteer knows ("from a Chinese port"). */
function legNamedBy(waypoints: Waypoint[], note: string): number {
  const named = placesIn(note).map((p) => p.place.country);
  const pairs = waypoints.slice(0, -1).map((w, i) => ({ from: w.country, to: waypoints[i + 1].country, i }));
  for (let a = 0; a < named.length - 1; a++) {
    const exact = pairs.find((p) => p.from === named[a] && p.to === named[a + 1]);
    if (exact) return exact.i;
  }
  for (const country of named) {
    const leaving = pairs.find((p) => p.from === country);
    if (leaving) return leaving.i;
  }
  // A note naming nowhere the gazetteer knows ("from a Chinese port") falls
  // back to the final approach.
  return pairs.length - 1;
}

/* The port a note names inside a country — and only a real port.
 *
 * `placesIn` also resolves a bare country name to that country's hub, so
 * "road leg from Hairatan" through Afghanistan yields Mazar-i-Sharif (from the
 * word "Afghanistan") as well as Hairatan. Taking the first match inserted the
 * hub a second time and produced a zero-length leg; the hub is skipped, so
 * only a place the note names in its own right is used. */
function portIn(note: string, country: string): Place | null {
  const hub = hubOf(country);
  return (
    placesIn(note)
      .map((p) => p.place)
      .find((p) => p.country === country && p.name !== hub?.name) ?? null
  );
}

/** The point a fraction of the way along the chain, on the same geodesic the
 *  map draws so the marker cannot drift off its own line. */
export function pointAt(corridor: Corridor, fraction: number): { at: LngLat; segment: Segment | null } {
  const f = Math.min(1, Math.max(0, fraction));
  for (const [i, s] of corridor.segments.entries()) {
    const start = corridor.marks[i];
    const end = corridor.marks[i + 1];
    if (f <= end || i === corridor.segments.length - 1) {
      const within = end === start ? 0 : (f - start) / (end - start);
      return { at: geoInterpolate(s.from.at, s.to.at)(Math.min(1, Math.max(0, within))) as LngLat, segment: s };
    }
  }
  const first = corridor.segments[0];
  return { at: first.from.at, segment: first };
}

/* ------------------------------------------------------------ milestones --- */

/* Where each milestone puts the cargo.
 *
 * Everything up to and including `loaded` happens at the origin — the wagon is
 * being filled, so the marker must not creep forward just because paperwork
 * advanced. `at_border` snaps to the first border rather than a share, because
 * that is a place the corridor actually names. The two moving states in between
 * get a share each, and the labels beside them say which milestone they are. */
const AT_ORIGIN: Milestone[] = ["planned", "capacity_requested", "capacity_confirmed", "cargo_ready", "loaded"];

export function placementFor(corridor: Corridor, milestone: Milestone): Placement {
  if (AT_ORIGIN.includes(milestone)) {
    return { at: corridor.waypoints[0].at, fraction: 0, segment: corridor.segments[0] ?? null, basis: milestone, moving: false };
  }
  if (milestone === "arrived") {
    const end = corridor.waypoints[corridor.waypoints.length - 1];
    return { at: end.at, fraction: 1, segment: corridor.segments[corridor.segments.length - 1] ?? null, basis: milestone, moving: false };
  }

  const firstBorder = corridor.borders[0] ?? 0.5;
  const fraction =
    milestone === "dispatched"
      ? firstBorder / 2
      : milestone === "at_border"
        ? firstBorder
        : /* cleared */ firstBorder + (1 - firstBorder) / 2;

  const { at, segment } = pointAt(corridor, fraction);
  return { at, fraction, segment, basis: milestone, moving: milestone !== "at_border" };
}

/** Screen bearing at a fraction of the corridor, in degrees clockwise from
 *  north — what a vehicle glyph has to be rotated by so it faces the way it is
 *  going. Taken from a short step along the same geodesic the line is drawn
 *  on, so the glyph never points off its own track. */
export function bearingAt(corridor: Corridor, fraction: number): number {
  const step = 0.004;
  const a = pointAt(corridor, Math.max(0, Math.min(1 - step, fraction))).at;
  const b = pointAt(corridor, Math.max(step, Math.min(1, fraction + step))).at;
  const toRad = Math.PI / 180;
  const dLon = (b[0] - a[0]) * toRad;
  const lat1 = a[1] * toRad;
  const lat2 = b[1] * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/* What the shipment is actually moving.
 *
 * Two different facts, and the UI must not blur them:
 *   - what the TRADER DECLARED — "3 containers", "4 wagons", "20 tonnes".
 *     Intake extracts this (`QUANTITY_UNIT` in workflow/domain.ts covers
 *     containers, wagons, railcars, trucks, kg and tonnes) and `toTonnes`
 *     prices each one, so a container case really is a container case.
 *   - what the PLANNER WORKED OUT it takes to carry that — "1 × covered
 *     wagon" — which is a transport unit chosen from the mode, and is never
 *     a container whatever the trader said.
 *
 * The map shows the declared unit when there is one, because that is what the
 * trader is moving; the planner's transport unit stays available beside it. */
export type CargoGlyph = "container" | "wagon" | "truck" | "pallet" | "crate" | "weight";

export function cargoGlyphFor(unit: string | null | undefined): CargoGlyph | null {
  if (!unit) return null;
  const u = unit.toLowerCase();
  if (/^container/.test(u)) return "container";
  if (/^(wagon|railcar)/.test(u)) return "wagon";
  if (/^(truck|lorr|fura|trailer)/.test(u)) return "truck";
  if (/^pallet/.test(u)) return "pallet";
  if (/^(case|box|carton|crate)/.test(u)) return "crate";
  if (/^(t|ton|mt|kg|kilo|lb|pound)/.test(u)) return "weight";
  return null;
}

/** What to show as the cargo: the declared unit when the trader gave one,
 *  otherwise the transport unit the planner derived. */
export function cargoOf(
  declared: { quantity: number | null; unit: string | null },
  planned: { kind: string; count: number },
): { glyph: CargoGlyph; count: number; label: string; source: "declared" | "planned" } {
  const glyph = cargoGlyphFor(declared.unit);
  if (glyph && glyph !== "weight" && declared.quantity) {
    const unit = declared.unit!.replace(/s$/, "");
    return { glyph, count: declared.quantity, label: `${declared.quantity} × ${unit}`, source: "declared" };
  }
  return {
    glyph: unitGlyph(planned.kind) as CargoGlyph,
    count: planned.count,
    label: `${planned.count} × ${planned.kind}`,
    source: "planned",
  };
}

/** The cargo unit a shipment is carried in, as the planner names it
 *  ("covered wagon", "refrigerated truck", "air pallet"). The planner has no
 *  container unit — the 20ft/40ft codes live in the units registry only — so
 *  there is deliberately no container glyph to pick here. */
export type UnitGlyph = "wagon" | "truck" | "pallet" | "crate";

export function unitGlyph(kind: string): UnitGlyph {
  if (/wagon/i.test(kind)) return "wagon";
  if (/truck|lorry/i.test(kind)) return "truck";
  if (/pallet/i.test(kind)) return "pallet";
  return "crate";
}

/** The glyph a leg is covered by. Mirrors `Segment.kind` so the legend and the
 *  marker cannot disagree. */
export const GLYPH: Record<Segment["kind"], "train" | "truck" | "ship" | "plane"> = {
  rail: "train",
  road: "truck",
  sea: "ship",
  air: "plane",
};

/* ----------------------------------------------------------- inspections --- */

/* Where a person has to be present, and what happens there.
 *
 * Every one of these is a published step whose lane is `physical` — the goods
 * must be there, so it happens at a place on the corridor. The procedure names
 * the facility ("Office of the inspector on the border checkpoint") but never
 * a coordinate, so each step is anchored to the corridor point its own wording
 * implies: a border checkpoint to the border, loading and pre-shipment checks
 * to the origin, anything after dispatch to the destination.
 *
 * That is a reading of the step, not a survey. The card says the facility the
 * procedure names, so the claim on screen is the procedure's, not ours. */

export type InspectionAnchor = "origin" | "border" | "destination";

export type Inspection = {
  stepNum: number;
  title: string;
  /** The facility the procedure names. */
  where: string;
  anchor: InspectionAnchor;
};

const BORDER_PLACE = /border|checkpoint|crossing|frontier|post of/i;
const DISPATCH = /dispatch|departure|sending|hand ?over to the carrier/i;

export function inspectionsOf(
  steps: { num: number; title: string; where: string; entity: string; lane: string }[],
): Inspection[] {
  const dispatchAt = steps.find((s) => DISPATCH.test(s.title))?.num ?? Number.POSITIVE_INFINITY;
  return steps
    .filter((s) => s.lane === "physical")
    .map((s) => {
      const place = s.where || s.entity;
      const anchor: InspectionAnchor = BORDER_PLACE.test(place) || BORDER_PLACE.test(s.title)
        ? "border"
        : s.num > dispatchAt
          ? "destination"
          : "origin";
      return { stepNum: s.num, title: s.title, where: place, anchor };
    })
    .sort((a, b) => a.stepNum - b.stepNum);
}

/** Where on the corridor each anchor sits, so the markers land on the line. */
export function anchorPoints(corridor: Corridor): Record<InspectionAnchor, LngLat> {
  return {
    origin: corridor.waypoints[0].at,
    border: pointAt(corridor, corridor.borders[0] ?? 0.5).at,
    destination: corridor.waypoints[corridor.waypoints.length - 1].at,
  };
}
