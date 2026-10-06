"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "../icons";

type Row = { id: string; title: string; status: string };

/* The sidebar's list of the trader's cases, newest first, where the chat
 * history used to be: the dashboard is driven by cases now, not by chats. */
export default function RecentCases() {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = pathname === "/" ? params.get("case")?.toUpperCase() ?? null : pathname.startsWith("/cases/") ? pathname.split("/")[2] : null;
  const [cases, setCases] = useState<Row[] | null>(null);

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

  return (
    <div className="recents">
      <Link className="recents-new" href="/?case=new">
        <span className="nav-icon">{Icon.plus}</span>
        <span>New shipment</span>
      </Link>

      {cases === null ? null : cases.length === 0 ? (
        <p className="recents-empty">Your cases show up here.</p>
      ) : (
        <>
          <p className="recents-head">Your cases</p>
          <ul className="recents-list">
            {cases.slice(0, 12).map((c) => (
              <li key={c.id}>
                <Link className={c.id === current ? "recents-item is-current" : "recents-item"} href={`/?case=${encodeURIComponent(c.id)}`} title={c.title}>
                  <span className="recents-title">{c.title}</span>
                  <span className="recents-when">{c.id.slice(-4)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
