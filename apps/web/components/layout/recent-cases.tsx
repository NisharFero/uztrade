"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "../icons";

type Row = { id: string; title: string; status: string };

/* The sidebar's list of the trader's cases, newest first, where the chat
 * history used to be: the dashboard is driven by cases now, not by chats.
 *
 * The list is folded away behind one line. Left open it pushed the navigation
 * up and turned the rail into a wall of near-identical shipment titles, so
 * the rail now shows what the trader navigates with and keeps the history one
 * click away. It opens on its own only when a case from it is the one on
 * screen, so the open case is never hidden from its own list. */
export default function RecentCases() {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = pathname === "/" ? params.get("case")?.toUpperCase() ?? null : pathname.startsWith("/cases/") ? pathname.split("/")[2] : null;
  const [cases, setCases] = useState<Row[] | null>(null);
  /** null until the trader decides; the open case opens it until then. */
  const [open, setOpen] = useState<boolean | null>(null);

  // Reloaded on every navigation, so a case started a moment ago is listed.
  useEffect(() => {
    let live = true;
    fetch("/api/cases")
      .then((r) => (r.ok ? r.json() : { cases: [] }))
      .then((body: { cases?: Row[] }) => live && setCases((body.cases ?? []).map((c) => ({ id: c.id, title: c.title, status: c.status }))))
      .catch(() => live && setCases([]));
    return () => {
      live = false;
    };
  }, [pathname, params]);

  const rows = (cases ?? []).slice(0, 12);
  const holdsCurrent = Boolean(current && rows.some((c) => c.id === current));
  const expanded = open ?? holdsCurrent;

  return (
    <div className="recents">
      <Link className="recents-new" href="/?case=new">
        <span className="nav-icon">{Icon.plus}</span>
        <span>New shipment</span>
      </Link>

      {cases === null ? null : rows.length === 0 ? (
        <p className="recents-empty">Your cases show up here.</p>
      ) : (
        <>
          <button
            type="button"
            className="recents-toggle"
            aria-expanded={expanded}
            aria-controls="recents-list"
            onClick={() => setOpen(!expanded)}
          >
            <span>Previous cases</span>
            <span className="recents-count">{rows.length}</span>
            <span className="recents-chevron" data-open={expanded ? "true" : "false"} aria-hidden="true">
              {Icon.chevron}
            </span>
          </button>

          {expanded ? (
            <ul className="recents-list" id="recents-list">
              {rows.map((c) => (
                <li key={c.id}>
                  <Link className={c.id === current ? "recents-item is-current" : "recents-item"} href={`/?case=${encodeURIComponent(c.id)}`} title={c.title}>
                    <span className="recents-title">{c.title}</span>
                    <span className="recents-when">{c.id.slice(-4)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
