import type { Metadata } from "next";
import { cookies } from "next/headers";
import Workspace from "../components/chat/workspace";
import { currentCase, type CaseSummary } from "../modules/cases/current-case";
import { LAST_CASE_COOKIE } from "../modules/cases/last-case";
import { listCases } from "../modules/cases/store";
import { tailorProcedure } from "../modules/workflow/tailor";
import { CATALOGUE, PROCEDURE_IDS } from "../modules/procedures/data/procedures.generated";

export const metadata: Metadata = {
  title: "UzTrade Trade Agent",
  description:
    "A chat-first dashboard for trade procedure, document, and risk guidance.",
};

export const dynamic = "force-dynamic";

export default async function Home() {
  // Starter chips: the shipment procedures, which is what a trader opens a case against.
  const supported = PROCEDURE_IDS.map((id) => CATALOGUE[id])
    .filter((p) => p.kind !== "service")
    .map((p) => ({ id: p.id, title: p.title, goods: p.goods, mode: p.mode, direction: p.direction }));

  // Below the chat: the current step of the case checked last - created here
  // or opened in Cases & Shipments.
  let current: CaseSummary | null = null;
  let recent: { id: string; title: string; line: string; status: string }[] = [];
  try {
    const last = (await cookies()).get(LAST_CASE_COOKIE)?.value;
    current = await currentCase(last ? decodeURIComponent(last) : null);
    // The case's own title is the tailored one, written when it was opened.
    recent = (await listCases()).slice(0, 5).map((c) => ({
      id: c.id,
      title: c.title,
      line: CATALOGUE[c.procedureId]?.title ?? "",
      status: c.status,
    }));
  } catch {
    current = null; // no database - just the chat
  }

  return (
    <>
      <header className="topbar">
        <p>Dashboard</p>
        <h1>Ask UzTrade</h1>
      </header>

      <Workspace supported={supported} current={current} recent={recent} />
    </>
  );
}

function parseFacts(raw: string | null | undefined) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
