"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoCircle, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import { placementFor, type LngLat } from "../../modules/map/corridor";
import { MILESTONE_LABEL, type Milestone } from "../../modules/transit/transit";
import land110 from "../../modules/map/data/land-110m.json";
import type { MapCase } from "./world-map";

/* Every booking on one globe.
 *
 * Canvas, not SVG, and the 110m land layer rather than the 50m terrain the
 * flat map uses: a rotation re-projects every arc on every frame, and 400
 * coarse arcs to a canvas is a few milliseconds where 4,340 fine ones as DOM
 * nodes would drop frames on a laptop and crawl on a phone. The projection is
 * a real orthographic one, so this is a globe and not a picture of a globe.
 *
 * Positions are the same modelled ones the flat map draws — corridor plus the
 * case's last milestone. There is no carrier feed behind any of it, and the
 * caption and every tooltip say so. */

const LAND = feature(
  land110 as unknown as Parameters<typeof feature>[0],
  (land110 as unknown as { objects: { land: unknown } }).objects.land as Parameters<typeof feature>[1],
) as unknown as FeatureCollection<Geometry>;

const GRATICULE = geoGraticule10();
const SIZE = 560;

type Hit = { id: string; x: number; y: number };

const MODE_COLOUR: Record<string, string> = {
  rail: "#1447e6",
  road: "#b75000",
  sea: "#0092b5",
  air: "#c600db",
};

export default function Globe({
  cases,
  status,
  onOpen,
}: {
  cases: MapCase[];
  status: Record<string, { milestone: Milestone } | null>;
  onOpen: (id: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hits = useRef<Hit[]>([]);
  const drag = useRef<{ x: number; y: number; l: number; p: number } | null>(null);
  // Centred on the corridor everything here runs from.
  const [spin, setSpin] = useState<[number, number]>([-62, -36]);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  /** Markers in globe space, recomputed when the data or the spin changes. */
  const marks = useMemo(
    () =>
      cases.map((c) => ({
        id: c.id,
        title: c.title,
        at: placementFor(c.corridor, status[c.id]?.milestone ?? "planned").at,
        label: MILESTONE_LABEL[status[c.id]?.milestone ?? "planned"],
      })),
    [cases, status],
  );

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = SIZE * dpr;
    el.height = SIZE * dpr;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const projection = geoOrthographic()
      .rotate([spin[0], spin[1]])
      .fitExtent(
        [
          [12, 12],
          [SIZE - 12, SIZE - 12],
        ],
        { type: "Sphere" },
      );
    const path = geoPath(projection, ctx);

    ctx.clearRect(0, 0, SIZE, SIZE);

    // Ocean
    ctx.beginPath();
    path({ type: "Sphere" });
    ctx.fillStyle = "#cfe0ec";
    ctx.fill();

    // Graticule
    ctx.beginPath();
    path(GRATICULE);
    ctx.strokeStyle = "rgba(90,130,160,0.28)";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Land
    ctx.beginPath();
    path(LAND);
    ctx.fillStyle = "#e8efdc";
    ctx.fill();
    ctx.strokeStyle = "#9fb8aa";
    ctx.lineWidth = 0.6;
    ctx.stroke();

    // Corridors, each leg in its own mode.
    for (const c of cases) {
      for (const s of c.corridor.segments) {
        ctx.beginPath();
        path({ type: "LineString", coordinates: [s.from.at, s.to.at] });
        ctx.strokeStyle = MODE_COLOUR[s.kind] ?? MODE_COLOUR.rail;
        ctx.lineWidth = hover?.id === c.id ? 3 : 1.6;
        ctx.globalAlpha = hover && hover.id !== c.id ? 0.35 : 0.95;
        ctx.setLineDash(s.kind === "road" ? [6, 4] : s.kind === "sea" ? [1.5, 4] : s.kind === "air" ? [10, 5] : []);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    }

    /* Markers, and the hit list the pointer is tested against. A point on the
       far side of the globe must not be clickable, so each is checked against
       the visible hemisphere before it is drawn at all. */
    const visible = geoCircle().radius(90).center([-spin[0], -spin[1]])();
    const inFront = (at: LngLat) => {
      const r = projection.rotate();
      const [lon, lat] = at;
      const toRad = Math.PI / 180;
      const c = Math.sin(-r[1] * toRad) * Math.sin(lat * toRad) + Math.cos(-r[1] * toRad) * Math.cos(lat * toRad) * Math.cos((lon + r[0]) * toRad);
      return c > 0;
    };
    void visible;

    const next: Hit[] = [];
    for (const m of marks) {
      if (!inFront(m.at)) continue;
      const xy = projection(m.at);
      if (!xy) continue;
      const [x, y] = xy;
      next.push({ id: m.id, x, y });
      const on = hover?.id === m.id;
      ctx.beginPath();
      ctx.arc(x, y, on ? 7 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = on ? 3 : 2;
      ctx.strokeStyle = "#0b6f86";
      ctx.stroke();
    }
    hits.current = next;
  }, [cases, marks, spin, hover]);

  const at = (e: React.PointerEvent | React.MouseEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * SIZE, ((e.clientY - r.top) / r.height) * SIZE] as const;
  };

  const nearest = (x: number, y: number) =>
    hits.current.find((h) => (h.x - x) ** 2 + (h.y - y) ** 2 < 144) ?? null;

  return (
    <div className="globe">
      <div className="globe-stage">
        <canvas
          ref={canvas}
          style={{ width: SIZE, height: SIZE }}
          data-grabbing={grabbing ? "true" : undefined}
          role="img"
          aria-label={`${cases.length} bookings on a rotatable globe`}
          onPointerDown={(e) => {
            const [x, y] = at(e);
            drag.current = { x, y, l: spin[0], p: spin[1] };
            setGrabbing(true);
          }}
          onPointerMove={(e) => {
            const [x, y] = at(e);
            const d = drag.current;
            if (d) {
              setSpin([d.l + (x - d.x) * 0.35, Math.max(-85, Math.min(85, d.p - (y - d.y) * 0.35))]);
              return;
            }
            const h = nearest(x, y);
            setHover(h ? { id: h.id, x: h.x, y: h.y } : null);
          }}
          onPointerUp={() => {
            drag.current = null;
            setGrabbing(false);
          }}
          onPointerLeave={() => {
            drag.current = null;
            setGrabbing(false);
            setHover(null);
          }}
          onClick={(e) => {
            const [x, y] = at(e);
            const h = nearest(x, y);
            if (h) onOpen(h.id);
          }}
        />
        {hover ? (
          <div className="globe-tip" style={{ left: hover.x + 14, top: hover.y - 8 }}>
            <strong>{marks.find((m) => m.id === hover.id)?.title}</strong>
            <small>
              {hover.id} · {marks.find((m) => m.id === hover.id)?.label} — estimated from the last milestone. Click to
              open.
            </small>
          </div>
        ) : null}
      </div>

      <p className="globe-note">
        Drag to turn the globe. {cases.length} bookings, each leg in its own mode. Markers show the{" "}
        <strong>last milestone</strong>, placed on the published corridor — estimated, not a carrier position. Click a
        marker to open the case on the flat map.
      </p>
    </div>
  );
}
