import type { Metadata } from "next";
import Nav from "../components/layout/nav";
import "./styles/globals.css";

/* Fonts are self-hosted from public/fonts and declared in app/fonts.css.
   next/font is deliberately not used here: vinext emits absolute disk paths
   for it, which browsers block as file:// requests from an http origin. */

export const metadata: Metadata = {
  title: "UzTrade Trade Agent",
  description:
    "A case workspace for validated trade-procedure planning and agent-assisted execution.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {/* The shell lives here so every route shares the rail. */}
        <main className="shell premium-shell">
          <Nav />
          <section className="dashboard">{children}</section>
        </main>
      </body>
    </html>
  );
}
