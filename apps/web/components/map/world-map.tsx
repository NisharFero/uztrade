"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoMercator, geoPath, type GeoProjection } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import { Icon } from "../icons";
import { anchorPoints, bearingAt, cargoOf, GLYPH, placementFor, pointAt, type CargoGlyph, type Corridor, type Inspection, type InspectionAnchor, type LngLat } from "../../modules/map/corridor";
import { MILESTONE_LABEL, type Milestone } from "../../modules/transit/transit";
import CaseDetail, { type DetailTab } from "./case-detail";
import Globe from "./globe";
import atlas from "../../modules/map/data/terrain-50m.json";

/* The map.
 *
 * Hand-drawn SVG rather than a tile map, for three reasons that all matter
 * here: no API key or tile server to depend on, the countries take the app's
 * own tokens so dark mode works like everything else, and these corridors are
 * continental — a street-level basemap would be noise. d3-geo supplies the
 * projection and the geodesic resampling, so a route between two cities is
 * drawn as the arc it actually is.
 *
 * The 110m atlas is committed (105 KB, 177 countries) so nothing is fetched at
 * runtime. Live status comes from the existing /api/cases/:id/transit. */

export type MapCase = {
  id: string;
  title: string;
  goods: string;
  mode: string;
  corridor: Corridor;
  transitHours: [number, number];
  blocksDone: number;
  blocksTotal: number;
  /** What the cargo is carried in, as the planner names it. */
  units: { kind: string; count: number; perUnitT: number; assumed: boolean };
  tonnes: number | null;
  /** What the trader declared at intake: "3 containers", "20 tonnes". */
  declared: { quantity: number | null; unit: string | null };
  /** Published steps where a person has to be present. */
  inspections: Inspection[];
  blocks: {
    id: string;
    name: string;
    steps: number;
    state: string;
    startedAt: string | null;
    completedAt: string | null;
    actualHours: number | null;
    estimate: [number, number];
  }[];
  charges: { stepNum: number; title: string; entity: string; channel: string; blockId: string }[];
};

export type MapPlace = { name: string; at: LngLat };

export const MODE_TABS = ["all", "air", "rail", "road", "sea", "multimodal"] as const;
export type ModeTab = (typeof MODE_TABS)[number];

/** What a case counts as. Read from the legs, so a rail route carrying a
 *  Caspian ferry is multimodal rather than simply "rail". */
export function modeOf(c: MapCase): Exclude<ModeTab, "all"> {
  const kinds = new Set(c.corridor.segments.map((s) => s.kind));
  if (kinds.size > 1) return "multimodal";
  const [only] = [...kinds];
  return only ?? "rail";
}

/** Everything a case can be found by: its name, its goods and its route. */
function haystack(c: MapCase): string {
  return [c.id, c.title, c.goods, c.units.kind, ...c.corridor.waypoints.map((w) => w.name)].join(" ").toLowerCase();
}

const VIEW = { w: 1000, h: 520 };
const PAD = 26;
/** Beyond this a short corridor fills the frame with no country to place it by. */
const MAX_SCALE = 1500;

/** Natural Earth 50m, decoded once: land to colour, lakes and rivers to make
 *  it read as terrain, and country lines over the top. */
const layer = (name: "land" | "lakes" | "rivers" | "countries") =>
  feature(
    atlas as unknown as Parameters<typeof feature>[0],
    (atlas as unknown as { objects: Record<string, unknown> }).objects[name] as Parameters<typeof feature>[1],
  ) as unknown as FeatureCollection<Geometry>;

const LAND = layer("land");
const LAKES = layer("lakes");
const RIVERS = layer("rivers");
const COUNTRIES = layer("countries");

const GLYPH_ICON = { train: Icon.train, truck: Icon.truck, ship: Icon.ship, plane: Icon.plane } as const;
const CARGO_ICON: Record<CargoGlyph, React.ReactNode> = { container: Icon.container, wagon: Icon.wagon, truck: Icon.truck, pallet: Icon.pallet, crate: Icon.crate, weight: Icon.weight };

/* Vehicle outlines as raw path data, centred on 0,0 in a 24-unit box and
   drawn nose-right.
 *
 * Deliberately not the <svg> icons from the icon set: a nested <svg> starts a
 * new viewport, so a rotate/scale on the group around it moves the box and
 * leaves the artwork inside it untouched — which is why the first attempt drew
 * nothing but the plate. Paths share the map's coordinate space and transform
 * with it. */
/* The vehicle sits UPRIGHT on its plate and does not turn with the route.
 *
 * Rotating a side-on truck or train to an arbitrary compass bearing puts it
 * upside down on any westbound leg, which is how the first attempt read. Real
 * maps keep the pin upright and show direction on the line instead, which is
 * what the arrowheads below do. The icons are Lucide's, in their own 24-unit
 * box, so they are drawn centred by translating that box rather than by
 * redrawing them. */
function Vehicle({ kind, size }: { kind: keyof typeof GLYPH_ICON; size: number }) {
  const k = size / 24;
  return (
    <g className="map-vehicle" transform={`scale(${k}) translate(-12 -12)`} aria-hidden="true">
      {GLYPH_ICON[kind]}
    </g>
  );
}

/** A chevron on the line showing which way the cargo runs. */
function Heading({ x, y, bearing }: { x: number; y: number; bearing: number }) {
  return <path className="map-arrow" transform={`translate(${x} ${y}) rotate(${bearing - 90})`} d="M-3 -3.4 3 0l-6 3.4Z" />;
}



type Status = { milestone: Milestone; label: string; done: number; total: number } | null;

export default function WorldMap({ cases, places }: { cases: MapCase[]; places: MapPlace[] }) {
  const [selected, setSelected] = useState<string | null>(cases[0]?.id ?? null);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [tab, setTab] = useState<ModeTab>("all");
  const [query, setQuery] = useState("");
  /** Overview as a flat map, or every booking on a globe. */
  const [overview, setOverview] = useState<"map" | "globe">("map");
  /** The case opened in full, and which of its views is showing. */
  const [opened, setOpened] = useState<{ id: string; tab: DetailTab } | null>(null);
  const open = opened && cases.find((c) => c.id === opened.id) ? opened : null;
  const openedCase = open ? cases.find((c) => c.id === open.id)! : null;
  const live = useRef(true);

  /* Pan and zoom.
   *
   * The projection is never touched: a transform on the drawn group moves
   * everything together, so all the geometry above stays in projection space
   * and the marker maths does not have to know the view moved. `k` is handed
   * to CSS so labels and strokes can divide by it and keep their size. */
  /* The view carries the case it belongs to. Selecting another one reframes
     the projection, so an old pan would fight the new framing — holding the id
     in the state lets it expire by derivation instead of a render-time reset. */
  const HOME = { k: 1, x: 0, y: 0 };
  const [panned, setPanned] = useState<{ id: string; k: number; x: number; y: number } | null>(null);
  const view = panned && panned.id === selected ? panned : HOME;
  const setView = (next: { k: number; x: number; y: number }) => selected && setPanned({ id: selected, ...next });
  const [grabbing, setGrabbing] = useState(false);
  /** What the trader last clicked on the map, explained in words. */
  const [told, setTold] = useState<{ title: string; kind: string; lines: string[] } | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  /** Zoom about a point in viewBox units, so the map grows where you point. */
  const zoomAt = (factor: number, cx = VIEW.w / 2, cy = VIEW.h / 2) => {
    const k = Math.min(8, Math.max(1, view.k * factor));
    if (k === view.k) return;
    const scale = k / view.k;
    setView({ k, x: cx - (cx - view.x) * scale, y: cy - (cy - view.y) * scale });
  };

  /** Pointer position in viewBox units, whatever the element is scaled to. */
  const toViewBox = (clientX: number, clientY: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return [VIEW.w / 2, VIEW.h / 2] as const;
    return [((clientX - r.left) / r.width) * VIEW.w, ((clientY - r.top) / r.height) * VIEW.h] as const;
  };

  /* Where each shipment stands, from the endpoint the case workspace already
     uses. One request per case, in parallel, and a case whose transit cannot
     be read simply keeps its planned position. */
  useEffect(() => {
    if (!told) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setTold(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [told]);

  useEffect(() => {
    live.current = true;
    const ids = cases.map((c) => c.id);
    Promise.all(
      ids.map(async (id) => {
        try {
          const r = await fetch(`/api/cases/${encodeURIComponent(id)}/transit`);
          if (!r.ok) return [id, null] as const;
          const body = (await r.json()) as { status?: { milestone?: string; label?: string; done?: number; total?: number } };
          const m = body.status?.milestone;
          if (!m || !(m in MILESTONE_LABEL)) return [id, null] as const;
          return [
            id,
            { milestone: m as Milestone, label: body.status?.label ?? MILESTONE_LABEL[m as Milestone], done: body.status?.done ?? 0, total: body.status?.total ?? 0 },
          ] as const;
        } catch {
          return [id, null] as const;
        }
      }),
    ).then((pairs) => {
      if (live.current) setStatus(Object.fromEntries(pairs));
    });
    return () => {
      live.current = false;
    };
  }, [cases]);

  /* Framed on the case being looked at, which is the question this page
     answers. Fitting the union instead made a 831 km run a speck beside a
     3,489 km one. A short corridor would zoom past any useful context, so the
     scale is capped and the view recentred on the corridor's middle. */
  const focus = useMemo(() => cases.find((c) => c.id === selected) ?? cases[0], [cases, selected]);

  const projection: GeoProjection = useMemo(() => {
    const points: LngLat[] = (focus ? focus.corridor.waypoints : cases.flatMap((c) => c.corridor.waypoints)).map((w) => w.at);
    void selected;
    const p = geoMercator();
    if (!points.length) return p;

    const extent: FeatureCollection<Geometry> = {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: { type: "MultiPoint", coordinates: points } }],
    };
    p.fitExtent([[PAD * 3, PAD * 2], [VIEW.w - PAD * 3, VIEW.h - PAD * 2]], extent);

    if (p.scale() > MAX_SCALE) {
      p.scale(MAX_SCALE);
      const lon = points.reduce((a, c) => a + c[0], 0) / points.length;
      const lat = points.reduce((a, c) => a + c[1], 0) / points.length;
      const [x, y] = p([lon, lat]) ?? [VIEW.w / 2, VIEW.h / 2];
      const [tx, ty] = p.translate();
      p.translate([tx + VIEW.w / 2 - x, ty + VIEW.h / 2 - y]);
    }
    return p;
  }, [cases, focus, selected]);

  /* The list the filters leave. Counts come from the same function the tabs
     filter by, so a tab can never show a number it then fails to produce. */
  const counts = useMemo(() => {
    const n: Record<string, number> = { all: cases.length };
    for (const c of cases) {
      const m = modeOf(c);
      n[m] = (n[m] ?? 0) + 1;
    }
    return n;
  }, [cases]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cases.filter((c) => (tab === "all" || modeOf(c) === tab) && (!q || haystack(c).includes(q)));
  }, [cases, tab, query]);

  /** Names already printed by a route's own stops. */
  const onRoutes = useMemo(
    () => new Set(cases.flatMap((c) => c.corridor.waypoints.map((w) => w.name.replace(/ · .*/, "")))),
    [cases],
  );

  const path = useMemo(() => geoPath(projection), [projection]);
  const xy = (at: LngLat) => projection(at) ?? [0, 0];

  /** Cases whose marker lands on the same spot share one dot. Rounding to
   *  whole units of the viewBox is about a pixel on screen. */
  const clusters = useMemo(() => {
    const bySpot = new Map<
      string,
      { key: string; x: number; y: number; on: boolean; moving: boolean; label: string; lead: MapCase; cases: MapCase[]; glyph: keyof typeof GLYPH_ICON; bearing: number }
    >();
    for (const c of cases) {
      const st = status[c.id];
      const place = placementFor(c.corridor, st?.milestone ?? "planned");
      const [px, py] = projection(place.at) ?? [0, 0];
      const x = Math.round(px);
      const y = Math.round(py);
      const key = `${x}:${y}`;
      const found = bySpot.get(key);
      const label = st?.label ?? MILESTONE_LABEL.planned;
      const glyph = GLYPH[place.segment?.kind ?? "rail"];
      const bearing = bearingAt(c.corridor, place.fraction);
      if (!found) {
        bySpot.set(key, { key, x, y, on: c.id === selected, moving: place.moving, label, lead: c, cases: [c], glyph, bearing });
      } else {
        found.cases.push(c);
        // The selected case always leads its own cluster, and labels it.
        if (c.id === selected) Object.assign(found, { on: true, moving: place.moving, label, lead: c, glyph, bearing });
      }
    }
    return [...bySpot.values()].sort((a, b) => Number(a.on) - Number(b.on));
  }, [cases, status, projection, selected]);

  const figure = (
      <figure className="map-figure">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
          role="img"
          aria-label={`${cases.length} shipment corridors`}
          data-grabbing={grabbing ? "true" : undefined}
          style={{ ["--k" as string]: view.k }}
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            const [px, py] = toViewBox(e.clientX, e.clientY);
            drag.current = { x: px, y: py, ox: view.x, oy: view.y };
            setGrabbing(true);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const [px, py] = toViewBox(e.clientX, e.clientY);
            setView({ k: view.k, x: d.ox + (px - d.x), y: d.oy + (py - d.y) });
          }}
          onPointerUp={() => {
            drag.current = null;
            setGrabbing(false);
          }}
          onClick={() => setTold(null)}
          onPointerLeave={() => {
            drag.current = null;
            setGrabbing(false);
          }}
          onWheel={(e) => {
            const [px, py] = toViewBox(e.clientX, e.clientY);
            zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, px, py);
          }}
        >
          <rect className="map-sea" x="0" y="0" width={VIEW.w} height={VIEW.h} />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g className="map-land">
            {LAND.features.map((f, i) => {
              const d = path(f);
              return d ? <path key={i} d={d} /> : null;
            })}
          </g>
          <g className="map-rivers">
            {RIVERS.features.map((f, i) => {
              const d = path(f);
              return d ? <path key={i} d={d} /> : null;
            })}
          </g>
          <g className="map-lakes">
            {LAKES.features.map((f, i) => {
              const d = path(f);
              return d ? <path key={i} d={d} /> : null;
            })}
          </g>
          <g className="map-borders">
            {COUNTRIES.features.map((f, i) => {
              const d = path(f);
              return d ? <path key={i} d={d} /> : null;
            })}
          </g>

          {/* Places the gazetteer knows, so the map names more than the stops
              on one route. Only those inside the frame are drawn. */}
          <g className="map-cities">
            {places.map((p) => {
              if (onRoutes.has(p.name)) return null;
              const xyp = projection(p.at);
              if (!xyp) return null;
              const [x, y] = xyp;
              if (x < 8 || x > VIEW.w - 8 || y < 8 || y > VIEW.h - 8) return null;
              return (
                <g key={p.name}>
                  <circle cx={x} cy={y} r={1.8} />
                  <text x={x + 5} y={y + 3}>{p.name}</text>
                </g>
              );
            })}
          </g>

          {cases.map((c) => {
            const on = c.id === selected;
            // The line animates only when the case itself says it is moving.
            const moving = placementFor(c.corridor, status[c.id]?.milestone ?? "planned").moving;
            return (
              <g key={c.id} className="map-route" data-on={on ? "true" : "false"} data-moving={moving ? "true" : "false"} data-mode={c.mode}>
                {c.corridor.segments.map((s, i) => {
                  const d = path({ type: "LineString", coordinates: [s.from.at, s.to.at] });
                  return d ? <path key={i} className="map-leg" data-kind={s.kind} d={d} /> : null;
                })}
                {on
                  ? c.corridor.segments.map((s, i) => {
                      const mid = c.corridor.marks[i] + s.share / 2;
                      const [ax, ay] = xy(pointAt(c.corridor, mid).at);
                      return <Heading key={`h${i}`} x={ax} y={ay} bearing={bearingAt(c.corridor, mid)} />;
                    })
                  : null}
                {c.corridor.waypoints.map((w, i) => {
                  const [x, y] = xy(w.at);
                  const edge = i === 0 || i === c.corridor.waypoints.length - 1;
                  const name = w.name.replace(/ · .*/, "");
                  return (
                    <g key={w.name}>
                      <circle className="map-stop" data-edge={edge ? "true" : "false"} cx={x} cy={y} r={edge ? 4 : 2.6} />
                      {on ? (
                        <>
                          <circle
                            className="map-stop-hit"
                            cx={x}
                            cy={y}
                            r={10}
                            onClick={(e) => {
                              e.stopPropagation();
                              const inbound = c.corridor.segments.find((s) => s.to.name === w.name);
                              const outbound = c.corridor.segments.find((s) => s.from.name === w.name);
                              setTold({
                                title: name,
                                kind: i === 0 ? "Origin" : edge ? "Destination" : "Corridor stop",
                                lines: [
                                  inbound ? `Arrives by ${GLYPH[inbound.kind]}${inbound.border ? ", crossing a border" : ""}.` : "",
                                  outbound ? `Leaves by ${GLYPH[outbound.kind]}${outbound.border ? ", crossing a border" : ""}.` : "",
                                  inbound && outbound && inbound.kind !== outbound.kind
                                    ? `The cargo changes from ${GLYPH[inbound.kind]} to ${GLYPH[outbound.kind]} here.`
                                    : "",
                                ].filter(Boolean),
                              });
                            }}
                          />
                          <text className="map-place" x={x} y={y + 15} textAnchor="middle" data-edge={edge ? "true" : "false"}>
                            {name}
                          </text>
                        </>
                      ) : null}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Where a person has to be present on the selected corridor. */}
          {focus
            ? (() => {
                const at = anchorPoints(focus.corridor);
                const byAnchor = new Map<InspectionAnchor, Inspection[]>();
                for (const i of focus.inspections) byAnchor.set(i.anchor, [...(byAnchor.get(i.anchor) ?? []), i]);
                return [...byAnchor.entries()].map(([anchor, list]) => {
                  const [x, y] = xy(at[anchor]);
                  return (
                    <g
                      key={anchor}
                      className="map-check"
                      transform={`translate(${x} ${y})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setTold({
                          title: `${list.length} ${list.length === 1 ? "stop" : "stops"} in person`,
                          kind: `At the ${anchor}`,
                          lines: list.map((i) => `${i.title} — step ${i.stepNum}, ${i.where}`),
                        });
                      }}
                    >
                      <circle className="map-check-ring" r={9} />
                      <path className="map-check-tick" d="M-3.2 0 -0.8 2.6 3.4-2.4" />
                      <text className="map-check-n" x={11} y={3.5}>
                        {list.length}
                      </text>
                      <title>{`${list.length} physical ${list.length === 1 ? "check" : "checks"} at the ${anchor}: ${list.map((i) => i.title).join("; ")}`}</title>
                    </g>
                  );
                });
              })()
            : null}

          {/* Markers last, so one is never hidden under a line. */}
          {clusters.map((cl) => (
            <g
              key={cl.key}
              className="map-mark"
              data-on={cl.on ? "true" : "false"}
              data-moving={cl.moving ? "true" : "false"}
              transform={`translate(${cl.x} ${cl.y})`}
              onMouseEnter={() => setSelected(cl.lead.id)}
              onClick={(e) => {
                e.stopPropagation();
                setSelected(cl.lead.id);
                setTold({
                  title: `${cl.lead.id} — ${cl.lead.title}`,
                  kind: `Shipment · by ${cl.glyph}`,
                  lines: [
                    `${cl.label}. The position is modelled from this milestone and the published corridor, not from a carrier feed.`,
                    `Moving ${cargoOf(cl.lead.declared, cl.lead.units).label}.`,
                    cl.cases.length > 1 ? `${cl.cases.length} cases are at this point; this is the one selected.` : "",
                  ].filter(Boolean),
                });
              }}
            >
              <circle className="map-mark-halo" r={cl.on ? 15 : 9} />
              {cl.on ? (
                <>
                  <circle className="map-mark-plate" r={14} />
                  <Vehicle kind={cl.glyph} size={19} />
                </>
              ) : (
                <circle className="map-mark-dot" r={4.5} />
              )}
              {cl.cases.length > 1 ? (
                <text className="map-mark-count" y={cl.on ? 3.5 : 3} textAnchor="middle">
                  {cl.cases.length}
                </text>
              ) : null}
              {cl.on ? (
                <text
                  className="map-mark-label"
                  y={-21}
                  /* Anchored away from whichever edge it is near, so a long
                     label is never clipped by the frame. */
                  textAnchor={cl.x > VIEW.w - 170 ? "end" : cl.x < 170 ? "start" : "middle"}
                  x={cl.x > VIEW.w - 170 ? 14 : cl.x < 170 ? -14 : 0}
                >
                  {cl.lead.id} · {cl.label}
                  {cl.cases.length > 1 ? ` · +${cl.cases.length - 1} here` : ""}
                </text>
              ) : null}
              <title>
                {cl.cases.length > 1
                  ? `${cl.cases.length} cases here. ${cl.lead.title} and ${cl.cases.length - 1} more, ${cl.label.toLowerCase()}.`
                  : `${cl.lead.id} — ${cl.lead.title}. ${cl.label}. Modelled from the corridor.`}
              </title>
            </g>
          ))}
          </g>
        </svg>

        {told ? (
          <div className="map-told" role="dialog" aria-label={told.title}>
            <p className="map-told-kind">{told.kind}</p>
            <p className="map-told-title">{told.title}</p>
            <ul>
              {told.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <button type="button" onClick={() => setTold(null)} aria-label="Close">
              Close
            </button>
          </div>
        ) : null}

        <div className="map-zoom">
          <button type="button" onClick={() => zoomAt(1.4)} aria-label="Zoom in" title="Zoom in">+</button>
          <button type="button" onClick={() => zoomAt(1 / 1.4)} aria-label="Zoom out" title="Zoom out">−</button>
          <button
            type="button"
            onClick={() => setPanned(null)}
            disabled={view.k === 1 && view.x === 0 && view.y === 0}
            aria-label="Reset the view"
            title="Reset the view"
          >
            ⤾
          </button>
        </div>

        <div className="map-legend">
          {([["rail", "Rail"], ["road", "Road"], ["sea", "Sea"], ["air", "Air"]] as const).map(([kind, label]) => (
            <span key={kind} className="map-legend-item">
              <svg viewBox="0 0 34 10" aria-hidden="true">
                <path className="map-leg" data-kind={kind} d="M1 5h32" />
              </svg>
              {label}
            </span>
          ))}
        </div>

        <figcaption>
          Mercator, framed on the selected case. Land, lakes, rivers and borders: Natural Earth 50m. A leg is drawn
          in the mode the corridor publishes for it, so a rail route with a road or ferry leg shows all of them.
          Positions are modelled from the corridor and the transit milestone — not a carrier feed.
        </figcaption>
      </figure>
  );

  if (open && openedCase) {
    return (
      <CaseDetail
        kase={openedCase}
        milestone={status[openedCase.id]?.milestone ?? null}
        tab={open.tab}
        onTab={(t) => setOpened({ id: openedCase.id, tab: t })}
        onClose={() => setOpened(null)}
        map={figure}
      />
    );
  }

  if (overview === "globe") {
    return (
      <>
        <OverviewTabs on={overview} onChange={setOverview} count={cases.length} />
        <Globe
          cases={cases}
          status={status}
          onOpen={(id) => {
            setSelected(id);
            setOverview("map");
            setOpened({ id, tab: "map" });
          }}
        />
      </>
    );
  }

  return (
    <>
      <OverviewTabs on={overview} onChange={setOverview} count={cases.length} />
      <div className="map-wrap">
      {figure}

      <div className="map-side">
        <div className="map-filters">
          <div className="map-tabs" role="tablist" aria-label="Filter by mode">
            {MODE_TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                data-on={tab === t ? "true" : "false"}
                disabled={t !== "all" && !counts[t]}
                onClick={() => setTab(t)}
              >
                {t === "all" ? "All" : t === "multimodal" ? "Multi" : t[0].toUpperCase() + t.slice(1)}
                <em>{counts[t] ?? 0}</em>
              </button>
            ))}
          </div>
          <label className="map-search">
            <span className="sr-only">Search cases</span>
            <input
              type="search"
              value={query}
              placeholder="Case, goods or route…"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        {shown.length === 0 ? (
          <p className="map-none">
            Nothing matches{query.trim() ? ` “${query.trim()}”` : ""}
            {tab !== "all" ? ` in ${tab}` : ""}.
          </p>
        ) : null}

      <ol className="map-list" aria-label="Cases on the map">
        {shown.map((c) => {
          const st = status[c.id];
          const place = placementFor(c.corridor, st?.milestone ?? "planned");
          const glyph = GLYPH[place.segment?.kind ?? "rail"];
          const first = c.corridor.waypoints[0];
          const last = c.corridor.waypoints[c.corridor.waypoints.length - 1];
          return (
            <li key={c.id}>
              <button
                type="button"
                className="map-row"
                data-on={c.id === selected ? "true" : "false"}
                aria-pressed={c.id === selected}
                onClick={() => setSelected(c.id)}
              >
                <span className="map-row-glyph" data-glyph={glyph} aria-hidden="true">
                  {GLYPH_ICON[glyph]}
                </span>
                <span className="map-row-main">
                  <strong>{c.title}</strong>
                  <small>
                    {first.name} → {last.name.replace(/ · .*/, "")}
                    {c.corridor.waypoints.length > 2 ? ` · via ${c.corridor.waypoints.length - 2}` : ""}
                    {" · "}
                    {c.corridor.distanceKm.toLocaleString("en-US")} km
                  </small>
                </span>
                <span className="map-row-right">
                  <span
                    className="map-open"
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${c.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(c.id);
                      setOpened({ id: c.id, tab: "map" });
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      e.stopPropagation();
                      setSelected(c.id);
                      setOpened({ id: c.id, tab: "map" });
                    }}
                  >
                    Open
                  </span>
                  <span className="map-row-state" data-moving={place.moving ? "true" : "false"}>
                    {st?.label ?? MILESTONE_LABEL.planned}
                  </span>
                  {(() => {
                    const cargo = cargoOf(c.declared, c.units);
                    return (
                      <span
                        className="map-units"
                        data-source={cargo.source}
                        title={
                          cargo.source === "declared"
                            ? `${cargo.label} — as declared at intake`
                            : `${cargo.label} — worked out by the planner from the load`
                        }
                      >
                        <span className="map-units-icon" aria-hidden="true">{CARGO_ICON[cargo.glyph]}</span>
                        {cargo.count}×
                        {/refrigerated/i.test(c.units.kind) ? (
                          <span className="map-reefer" title="Refrigerated — the cargo is perishable" aria-label="refrigerated">
                            {Icon.snowflake}
                          </span>
                        ) : null}
                      </span>
                    );
                  })()}
                </span>
              </button>

              {c.id === selected ? (
                <div className="map-detail">
                  <dl>
                    <div>
                      <dt>Goods</dt>
                      <dd>{c.goods || "—"}</dd>
                    </div>
                    <div>
                      <dt>By</dt>
                      <dd>{glyph}</dd>
                    </div>
                    <div>
                      <dt>Borders</dt>
                      <dd>{c.corridor.borders.length}</dd>
                    </div>
                    <div>
                      <dt>Modelled transit</dt>
                      <dd>
                        {Math.round(c.transitHours[0] / 24)}–{Math.round(c.transitHours[1] / 24)} days
                      </dd>
                    </div>
                    <div>
                      <dt>Procedure</dt>
                      <dd>
                        {c.blocksDone} of {c.blocksTotal} blocks
                      </dd>
                    </div>
                    <div>
                      <dt>Moving</dt>
                      <dd>
                        {cargoOf(c.declared, c.units).label}
                        <em className="map-assumed">
                          {" · "}
                          {cargoOf(c.declared, c.units).source === "declared" ? "declared" : "planned"}
                        </em>
                      </dd>
                    </div>
                    <div>
                      <dt>Carried in</dt>
                      <dd>
                        {c.units.count} × {c.units.kind}
                        {c.units.assumed ? <em className="map-assumed"> · load assumed</em> : null}
                      </dd>
                    </div>
                    {c.tonnes != null ? (
                      <div>
                        <dt>Load</dt>
                        <dd>
                          {c.tonnes} t · {c.units.perUnitT} t per unit
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  {c.inspections.length ? (
                    <details className="map-checks">
                      <summary>
                        <span>
                          {c.inspections.length} {c.inspections.length === 1 ? "stop" : "stops"} in person
                          {(() => {
                            const at = c.inspections.filter((i) => i.anchor === "border").length;
                            return at ? ` · ${at} at a border` : "";
                          })()}
                        </span>
                        <span className="map-checks-chevron" aria-hidden="true">
                          {Icon.chevron}
                        </span>
                      </summary>
                      <ol>
                        {c.inspections.map((i) => (
                          <li key={i.stepNum} data-anchor={i.anchor}>
                            <span className="map-check-at">{i.anchor}</span>
                            <span>
                              <strong>{i.title}</strong>
                              <small>
                                step {i.stepNum} · {i.where}
                              </small>
                            </span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  ) : null}
                  {c.corridor.segments.some((s) => s.kind === "air") ? (
                    <p className="map-note" data-kind="air">
                      Flown direct. The arc runs city to city — the gazetteer holds cities, not airports, so this is the
                      pair, not the runways.
                    </p>
                  ) : null}
                  {c.corridor.notes.sea ? <p className="map-note" data-kind="sea">{c.corridor.notes.sea}</p> : null}
                  {c.corridor.notes.road ? <p className="map-note" data-kind="road">{c.corridor.notes.road}</p> : null}
                  {c.corridor.notes.gaugeBreak ? <p className="map-note" data-kind="gauge">{c.corridor.notes.gaugeBreak}</p> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      </div>
      </div>
    </>
  );
}

/** The two ways in: one corridor at a time, or all of them at once. */
function OverviewTabs({ on, onChange, count }: { on: "map" | "globe"; onChange: (v: "map" | "globe") => void; count: number }) {
  return (
    <div className="map-main-tabs" role="tablist" aria-label="Overview">
      <button type="button" role="tab" aria-selected={on === "map"} data-on={on === "map"} onClick={() => onChange("map")}>
        <span aria-hidden="true">{Icon.route}</span> Shipments
      </button>
      <button type="button" role="tab" aria-selected={on === "globe"} data-on={on === "globe"} onClick={() => onChange("globe")}>
        <span aria-hidden="true">{Icon.globe}</span> All bookings <em>{count}</em>
      </button>
    </div>
  );
}
