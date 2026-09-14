import type { Metadata } from "next";
import { cookies } from "next/headers";
import Workspace from "../components/chat/workspace";
import { currentCase, type CaseSummary } from "../modules/cases/current-case";
import { LAST_CASE_COOKIE } from "../modules/cases/last-case";
import { PROCEDURE_IDS, PROCEDURES } from "../modules/procedures/data/procedures.generated";

export const metadata: Metadata = {
  title: "UzTrade Trade Agent",
  description:
    "A chat-first dashboard for trade procedure, document, and risk guidance.",
};

export const dynamic = "force-dynamic";

export default async function Home() {
  const supported = PROCEDURE_IDS.map((id) => ({
    id,
    title: PROCEDURES[id].title,
    goods: PROCEDURES[id].goods,
    mode: PROCEDURES[id].mode,
    direction: PROCEDURES[id].direction,
  }));

  // Below the chat: the current step of the case checked last - created here
  // or opened in Cases & Shipments.
  let current: CaseSummary | null = null;
  try {
    const last = (await cookies()).get(LAST_CASE_COOKIE)?.value;
    current = await currentCase(last ? decodeURIComponent(last) : null);
  } catch {
    current = null; // no database - just the chat
  }

  return (
    <>
      <header className="topbar">
        <p>Dashboard</p>
        <h1>Ask UzTrade</h1>
      </header>

      <Workspace supported={supported} current={current} />
    </>
  );
}
