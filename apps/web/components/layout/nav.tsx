"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Icon } from "../icons";
import RecentCases from "./recent-cases";

const items = [
  { href: "/", label: "Dashboard", icon: Icon.home, tint: "cyan", exact: true },
  { href: "/procedures", label: "Procedures", icon: Icon.book, tint: "blue" },
  { href: "/cases", label: "Cases & Shipments", icon: Icon.truck, tint: "cyan" },
  { href: "/ledger", label: "Ledger", icon: Icon.receipt, tint: "amber" },
  { href: "/faq", label: "FAQ", icon: Icon.help, tint: "fuchsia" },
  { href: "/entities", label: "Entities", icon: Icon.landmark, tint: "green" },
  { href: "/configuration", label: "Configuration", icon: Icon.sliders, tint: "blue" },
  { href: "/agents", label: "AI Agent Center", icon: Icon.bot, tint: "fuchsia" },
];

/** Closes the drawer whenever the page or the open chat changes. Reading the
 *  query makes this client-only, so it sits in its own Suspense boundary. */
function CloseOnNavigate({ onChange }: { onChange: () => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const chat = params.get("case");
  useEffect(() => onChange(), [pathname, chat, onChange]);
  return null;
}

export default function Nav() {
  const pathname = usePathname();
  /* On a laptop the rail is always there. On a phone or a narrow window it is
     a drawer, opened from the top bar, the way ChatGPT and Claude do it. */
  const [open, setOpen] = useState(false);
  const [close] = useState(() => () => setOpen(false));
  /* On the dashboard the rail folds to icons once a conversation starts, so
     the thread has the room; the trader can open it again, and it stays
     however they left it until the next conversation. */
  const [folded, setCollapsed] = useState(false);
  // Every other page is read with the full navigation.
  const collapsed = folded && pathname === "/";

  useEffect(() => {
    const onRail = (event: Event) => setCollapsed((event as CustomEvent<string>).detail === "collapse");
    window.addEventListener("uztrade:rail", onRail);
    return () => window.removeEventListener("uztrade:rail", onRail);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <header className="mobile-bar">
        <button type="button" className="mobile-bar-button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
          {Icon.menu}
        </button>
        <span className="mobile-bar-title">UzOne Trade Platform</span>
        <Link className="mobile-bar-button" href="/?case=new" aria-label="New shipment" title="New shipment">
          {Icon.compose}
        </Link>
      </header>

      {open ? <button type="button" className="sidebar-scrim" aria-label="Close menu" onClick={close} /> : null}

      <aside className={["sidebar", open ? "is-open" : "", collapsed ? "is-collapsed" : ""].filter(Boolean).join(" ")} aria-label="Main navigation">
        <div className="brand">
          <span aria-hidden="true">UZ</span>
          <div>
            <strong>UzOne</strong>
            <small>Trade Platform</small>
          </div>
          {collapsed ? null : (
            <button
              type="button"
              className="sidebar-fold"
              aria-label="Hide navigation"
              title="Hide navigation"
              aria-expanded
              onClick={() => setCollapsed(true)}
            >
              {Icon.close}
            </button>
          )}
          <button type="button" className="sidebar-close" aria-label="Close menu" onClick={close}>
            {Icon.close}
          </button>
        </div>

        <nav>
          {items.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);

            return (
              <Link className={active ? "nav-item active" : "nav-item"} href={item.href} key={item.label} title={collapsed ? item.label : undefined}>
                <span className="nav-icon" data-tint={item.tint}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* The case list reads ?case= to mark the open case, which makes it
            client-only; without a boundary it would stop every static page from
            prerendering (the 404 first). */}
        <Suspense fallback={null}>
          <RecentCases />
          <CloseOnNavigate onChange={close} />
        </Suspense>
      </aside>
    </>
  );
}
