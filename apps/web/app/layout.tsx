import type { Metadata } from "next";
import { Suspense } from "react";
import AppShell from "../components/layout/app-shell";
import "./styles/globals.css";

/* Fonts are self-hosted from public/fonts and declared in app/fonts.css.
   next/font is deliberately not used here: vinext emits absolute disk paths
   for it, which browsers block as file:// requests from an http origin. */

export const metadata: Metadata = {
  title: "UzOne Trade Platform",
  description:
    "Plan and run Uzbekistan export and import procedures with AI agents that file the online steps for you.",
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
        <Suspense fallback={null}><AppShell>{children}</AppShell></Suspense>
      </body>
    </html>
  );
}
