"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Nav from "./nav";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  if (pathname === "/" && !params.get("case") && !params.get("chat")) {
    return <main className="trade-home">{children}</main>;
  }
  return <main className="shell premium-shell"><Nav /><section className="dashboard">{children}</section></main>;
}
