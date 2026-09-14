import type { Metadata } from "next";
import Workspace from "../components/chat/workspace";
import { PROCEDURE_IDS, PROCEDURES } from "../modules/procedures/data/procedures.generated";
import { activeCase, type CaseSummary } from "../modules/cases/active-case";

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

  // One case at a time: while it's open, the chat is its current step.
  let open: CaseSummary | null = null;
  try {
    open = await activeCase();
  } catch {
    open = null;
  }

  return (
    <>
      <header className="topbar">
        <p>Dashboard</p>
        <h1>Ask UzTrade</h1>
      </header>

      <Workspace supported={supported} active={open} />
    </>
  );
}
