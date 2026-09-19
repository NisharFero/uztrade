"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon } from "../icons";

const items = [
  { href: "/", label: "Dashboard", icon: Icon.dashboard, exact: true },
  { href: "/procedures", label: "Procedures", icon: Icon.procedures },
  { href: "/cases", label: "Cases & Shipments", icon: Icon.shipments },
  { href: "/ledger", label: "Ledger", icon: Icon.list, children: ["Entity API records"] },
  { href: "/faq", label: "FAQ", icon: Icon.sparkle },
  { href: "/entities", label: "Entities", icon: Icon.physical },
  { href: "/agents", label: "AI Agent Center", icon: Icon.agents, children: ["All Agents"] },
  // Not in scope for the current procedures; shown so the shape of the
  // product is visible, but not linked anywhere that would 404.
  { href: null, label: "Documents", icon: Icon.documents },
  { href: null, label: "Compliance & Risk", icon: Icon.compliance },
];

export default function Nav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  /* On phones the nav is a horizontal scroller; bring the active pill into
     view. A no-op on desktop, where nothing overflows. */
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>(".nav-item.active");
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
    const n = nav.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    nav.scrollLeft += a.left - n.left - (n.width - a.width) / 2;
  }, [pathname]);

  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="brand">
        <span aria-hidden="true">UZ</span>
        <div>
          <strong>UzTrade</strong>
          <small>Trade Agent</small>
        </div>
      </div>

      <nav ref={navRef}>
        {items.map((item) => {
          const active = item.href
            ? item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href)
            : false;

          if (!item.href) {
            return (
              <span className="nav-item is-soon" key={item.label} aria-disabled="true">
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
                <small className="sub-nav">Soon</small>
              </span>
            );
          }

          return (
            <Link className={active ? "nav-item active" : "nav-item"} href={item.href} key={item.label}>
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.children ? <small className="sub-nav">{item.children.join(", ")}</small> : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
