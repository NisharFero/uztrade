"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import StepAssistant from "./step-assistant";
import { Icon } from "../icons";
import type { CaseSummary } from "../../modules/cases/current-case";
import { rememberCase } from "../../modules/cases/last-case";
import type { IntakeTurn } from "../../modules/intake/conversation";
import type { Slot } from "../../modules/intake/draft";

type Supported = {
  id: string;
  title: string;
  goods: string;
  mode: string;
  direction: string;
};

type Shown = { caseId: string; title: string; planSummary?: string };

type Phase = { kind: "idle" } | { kind: "pending" } | { kind: "error"; message: string };

type OpenedTurn = Omit<IntakeTurn, "status"> & {
  status: IntakeTurn["status"] | "opened";
  caseId?: string;
  title?: string;
  planSummary?: string;
};

const SLOT_PROMPT: Record<Slot, string> = {
  commodity: "what you're moving",
  direction: "export or import",
  mode: "how it travels",
  quantity: "how much",
  route: "from where to where",
};

const DEFAULT_QUERY = "I want to move tea";

/** The dashboard: the chat on top - "+" starts another case & shipment, and the
 *  intake asks what -> export/import -> how -> how much -> from/to before a
 *  confirm card - and below it the current step of the case checked last (the
 *  one just created, or the one last opened in Cases & Shipments). Anything
 *  that isn't a shipment goes to the FAQ. */
export default function Workspace({ supported, current }: { supported: Supported[]; current: CaseSummary | null }) {
  const router = useRouter();
  const [query, setQuery] = useState(current ? "" : DEFAULT_QUERY);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [turn, setTurn] = useState<IntakeTurn | null>(null);
  const [shown, setShown] = useState<Shown | null>(current ? { caseId: current.id, title: current.title } : null);
  // Suggestions show for a new shipment: with no case yet, or after "+".
  const [composing, setComposing] = useState(!current);
  const input = useRef<HTMLTextAreaElement>(null);
  const pending = phase.kind === "pending";

  const post = async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Request failed");
    return body;
  };

  const send = async (text?: string) => {
    const message = (text ?? query).trim();
    if (!message || pending) return;
    setPhase({ kind: "pending" });
    try {
      const active = turn && turn.status !== "declined" ? turn : null;
      const next = (await post({ message, draft: active?.draft ?? null, expecting: active?.slot ?? null })) as IntakeTurn;
      if (next.status === "declined") {
        router.push(`/faq?q=${encodeURIComponent(message)}`);
        return;
      }
      setTurn(next);
      setComposing(true);
      setQuery("");
      setPhase({ kind: "idle" });
    } catch (error) {
      setPhase({ kind: "error", message: error instanceof Error ? error.message : "Network error" });
    }
  };

  const confirm = async () => {
    if (!turn || pending) return;
    setPhase({ kind: "pending" });
    try {
      const body = (await post({ draft: turn.draft, confirm: true })) as OpenedTurn;
      if (body.status !== "opened" || !body.caseId) {
        // Something no longer holds - show the question the server asked instead.
        setTurn(body as IntakeTurn);
        setPhase({ kind: "idle" });
        return;
      }
      rememberCase(body.caseId);
      setShown({ caseId: body.caseId, title: body.title ?? "", planSummary: body.planSummary });
      setTurn(null);
      setComposing(false);
      setPhase({ kind: "idle" });
    } catch (error) {
      setPhase({ kind: "error", message: error instanceof Error ? error.message : "Network error" });
    }
  };

  const change = (slot: Slot) => {
    if (!turn) return;
    setTurn({ ...turn, status: "asking", slot, message: `Tell me ${SLOT_PROMPT[slot]}.`, options: [], summary: undefined });
    input.current?.focus();
  };

  /** "+" and "Start over": a fresh shipment conversation. The case below stays. */
  const newShipment = () => {
    setTurn(null);
    setQuery("");
    setComposing(true);
    setPhase({ kind: "idle" });
    input.current?.focus();
  };

  const asking = turn && turn.status !== "declined" ? turn : null;

  return (
    <>
      <section className="chat-panel command-surface" aria-label="Trade query">
        <div className="chat-head">
          <div className="chat-copy">
            <p>
              <span className="head-icon" data-tint="violet">
                {Icon.sparkle}
              </span>
              AI trade assistant
            </p>
            <h2>{asking ? "New case & shipment" : "Describe the goods you want to move"}</h2>
          </div>
          <button type="button" className="chat-new" onClick={newShipment} aria-label="New case & shipment" title="New case & shipment">
            +
          </button>
        </div>

        {asking ? (
          <div className="intake-card" aria-label="Shipment so far">
            <div className="intake-card-head">
              <span className="wf-detail-h">Shipment so far</span>
              <button type="button" className="intake-link" onClick={newShipment}>
                Start over
              </button>
            </div>

            <dl className="intake-progress">
              {asking.progress.map((row) => (
                <div
                  key={row.slot}
                  className="intake-row"
                  data-done={row.done || undefined}
                  data-current={(asking.status === "asking" && asking.slot === row.slot) || undefined}
                >
                  <dt>
                    <span className="intake-tick">{row.done ? Icon.check : null}</span>
                    {row.label}
                  </dt>
                  <dd>{row.value ?? "—"}</dd>
                  {asking.status === "confirm" ? (
                    <button type="button" className="intake-link" onClick={() => change(row.slot)}>
                      Change
                    </button>
                  ) : null}
                </div>
              ))}
            </dl>

            <div className="query-clarify" role="group" aria-label="Intake question">
              <p>
                <span className="head-icon">{Icon.sparkle}</span>
                {asking.message}
              </p>
              {asking.options.length ? (
                <div className="query-clarify-options">
                  {asking.options.map((o) => (
                    <button type="button" className="prompt" key={o.label} disabled={pending} onClick={() => send(o.reply)}>
                      {o.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {asking.notes.length ? (
              <ul className="intake-notes">
                {asking.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}

            {asking.status === "confirm" && asking.summary ? (
              <div className="intake-confirm">
                <p>
                  <strong>{asking.summary.title}</strong> · procedure {asking.summary.procedureId} ·{" "}
                  {asking.summary.howMuch} · {asking.summary.route}
                </p>
                <button type="button" className="intake-create" onClick={confirm} disabled={pending}>
                  {pending ? "Creating…" : "Create case & steps"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <form
          className="query-box"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <label className="sr-only" htmlFor="trade-query">
            Trade query
          </label>
          <div className="composer">
            <textarea
              id="trade-query"
              name="trade-query"
              ref={input}
              value={query}
              placeholder={asking?.slot ? `Answer: ${SLOT_PROMPT[asking.slot]}…` : "Describe a shipment, e.g. I want to move tea"}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <button type="submit" className="send" aria-label="Send request" title="Send request" disabled={pending}>
              <span className="btn-icon">{pending ? Icon.loader : Icon.send}</span>
            </button>
          </div>
        </form>

        {phase.kind === "error" ? (
          <p className="query-note" data-tone="error">
            <span className="head-icon">{Icon.clock}</span>
            {phase.message}
          </p>
        ) : null}

        {composing && !asking ? (
          <div className="quick-prompts" aria-label="Supported procedures">
            {supported.map((s) => (
              <button type="button" className="prompt" key={s.id} onClick={() => setQuery(`I want to ${s.direction} ${s.goods} by ${s.mode}`)}>
                {s.title}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {shown ? (
        <section className="current-case" aria-label="Current step">
          {shown.planSummary ? (
            <p className="opened-note">
              <span className="head-icon">{Icon.check}</span>
              Opened case {shown.caseId} — {shown.title}. {shown.planSummary}
            </p>
          ) : null}
          <StepAssistant key={shown.caseId} caseId={shown.caseId} compact />
        </section>
      ) : null}
    </>
  );
}
