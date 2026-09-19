"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AgentReply, { type ReplyBody } from "./agent-reply";
import StepAssistant from "./step-assistant";
import { Icon } from "../icons";
import type { ChatEvent, FollowUp, Stage } from "../../modules/assistant/chat";
import type { Routed } from "../../modules/assistant/router";
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

type Shown = { caseId: string; title: string };

type RecentCase = { id: string; title: string; line: string; status: string };

type OpenedTurn = Omit<IntakeTurn, "status"> & {
  status: IntakeTurn["status"] | "opened";
  caseId?: string;
  title?: string;
  planSummary?: string;
};

type Message =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      stages: Stage[];
      routed: Routed | null;
      body: ReplyBody | null;
      followUps: FollowUp[];
      error?: string;
    };

type Assistant = Extract<Message, { role: "assistant" }>;

const SLOT_PROMPT: Record<Slot, string> = {
  commodity: "what you're moving",
  direction: "export or import",
  mode: "how it travels",
  quantity: "how much",
  route: "from where to where",
};

/** Suggestions shown at once - more than this crowds the chat. */
const MAX_CHIPS = 4;

const STARTERS: FollowUp[] = [
  { label: "Which shipments are currently active?", text: "Which shipments are currently active?" },
  { label: "Who issues the phytosanitary certificate for tea?", text: "Who issues the phytosanitary certificate for tea?" },
];

/** Two varied shipments to start from (tea by rail, juice by road), then any others. */
const FEATURED = ["868", "161"];
const rank = (id: string) => (FEATURED.includes(id) ? FEATURED.indexOf(id) : FEATURED.length);
const pickStarters = (all: Supported[]) => [...all].sort((x, y) => rank(x.id) - rank(y.id)).slice(0, MAX_CHIPS - STARTERS.length);

/** The dashboard: a chat thread on top and, below it, the current step of the
 *  case checked last (created here, or opened in Cases & Shipments).
 *
 *  Every message goes to the chat agent, which works out whether it is a
 *  shipment, a question about your cases, or a question about the procedures,
 *  and streams its stages back. Replies are messages - an intake question is
 *  asked in words, one detail at a time - with suggested next messages under
 *  the latest one. A question asked mid-intake is answered without losing the
 *  shipment; "+" starts over. */
export default function Workspace({
  supported,
  current,
  recent = [],
}: {
  supported: Supported[];
  current: CaseSummary | null;
  /** The latest cases, to switch the one shown below the chat without leaving the dashboard. */
  recent?: RecentCase[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [turn, setTurn] = useState<IntakeTurn | null>(null);
  const [thread, setThread] = useState<Message[]>([]);
  const [shown, setShown] = useState<Shown | null>(current ? { caseId: current.id, title: current.title } : null);
  const input = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const nextId = () => {
    seq.current += 1;
    return `m${seq.current}`;
  };

  // "/" focuses the chat from anywhere on the dashboard, unless you're already typing somewhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep the newest message in view.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread]);

  const patch = (id: string, change: (m: Assistant) => Assistant) =>
    setThread((all) => all.map((m) => (m.id === id && m.role === "assistant" ? change(m) : m)));

  const say = (body: ReplyBody | null, followUps: FollowUp[] = [], error?: string) =>
    setThread((all) => [...all, { id: nextId(), role: "assistant", stages: [], routed: null, body, followUps, error }]);

  /** Reads the agent's newline-delimited JSON events as they arrive. */
  const chat = async (payload: Record<string, unknown>, onEvent: (event: ChatEvent) => void) => {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok || !response.body) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? "Request failed");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) onEvent(JSON.parse(line) as ChatEvent);
      }
      if (done) break;
    }
    if (buffer.trim()) onEvent(JSON.parse(buffer) as ChatEvent);
  };

  const send = async (text?: string, label?: string) => {
    const message = (text ?? query).trim();
    if (!message || pending || confirming) return;
    setPending(true);
    setQuery("");
    const active = turn && turn.status !== "declined" ? turn : null;
    const replyId = nextId();
    setThread((all) => [
      ...all,
      { id: nextId(), role: "user", text: label ?? message },
      { id: replyId, role: "assistant", stages: [], routed: null, body: null, followUps: [] },
    ]);
    try {
      await chat({ message, draft: active?.draft ?? null, expecting: active?.slot ?? null }, (event) => {
        if (event.type === "stage") {
          patch(replyId, (m) => ({ ...m, stages: [...m.stages.filter((s) => s.id !== event.stage.id), event.stage] }));
        } else if (event.type === "route") {
          patch(replyId, (m) => ({ ...m, routed: event.routed }));
        } else if (event.type === "result") {
          if (event.result.kind === "intake") setTurn(event.result.turn);
          const body = event.result;
          patch(replyId, (m) => ({ ...m, body, followUps: event.followUps ?? [] }));
        } else if (event.type === "error") {
          patch(replyId, (m) => ({ ...m, error: event.message }));
        }
      });
    } catch (error) {
      setQuery(message); // not lost to a failed request
      patch(replyId, (m) => ({ ...m, error: error instanceof Error ? error.message : "Network error" }));
    }
    setPending(false);
  };

  const confirm = async () => {
    if (!turn || pending || confirming) return;
    setConfirming(true);
    try {
      const response = await fetch("/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft: turn.draft, confirm: true }),
      });
      const body = (await response.json()) as OpenedTurn & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Request failed");
      if (body.status !== "opened" || !body.caseId) {
        // Something no longer holds - ask what the server asked.
        const next = body as IntakeTurn;
        setTurn(next);
        say({ kind: "intake", turn: next }, next.options.map((o) => ({ label: o.label, text: o.reply })));
      } else {
        rememberCase(body.caseId);
        router.refresh(); // the new case joins the recent list
        setShown({ caseId: body.caseId, title: body.title ?? "" });
        setTurn(null);
        say({ kind: "opened", caseId: body.caseId, title: body.title ?? "", planSummary: body.planSummary ?? "" }, [
          { label: `What is ${body.caseId} waiting on?`, text: `What is ${body.caseId} waiting on?` },
          { label: "Which shipments are currently active?", text: "Which shipments are currently active?" },
        ]);
      }
    } catch (error) {
      say(null, [], error instanceof Error ? error.message : "Network error");
    }
    setConfirming(false);
  };

  /** Re-asks one detail of a shipment waiting to be confirmed. */
  const change = (slot: Slot) => {
    if (!turn) return;
    const next: IntakeTurn = { ...turn, status: "asking", slot, message: `Tell me ${SLOT_PROMPT[slot]}.`, options: [], summary: undefined };
    setTurn(next);
    say({ kind: "intake", turn: next });
    input.current?.focus();
  };

  /** "+": a fresh conversation. The case below stays. */
  const startOver = () => {
    if (pending || confirming) return;
    setTurn(null);
    setThread([]);
    setQuery("");
    input.current?.focus();
  };

  const asking = turn && turn.status === "asking" ? turn : null;
  const last = thread.at(-1);
  const lastReply = last?.role === "assistant" && (last.body || last.error) ? last : null;
  // After a side question, offer the way back to the shipment detail still waiting (two at most).
  const resume: FollowUp[] =
    asking && lastReply && lastReply.body?.kind !== "intake" ? asking.options.slice(0, 2).map((o) => ({ label: o.label, text: o.reply })) : [];
  // At most MAX_CHIPS suggestions under a reply, the way back to the shipment included.
  const chips = lastReply ? [...lastReply.followUps.slice(0, MAX_CHIPS - resume.length), ...resume] : [];

  return (
    <>
      <section className="chat-panel command-surface" aria-label="Trade assistant">
        <div className="chat-head">
          <div className="chat-copy">
            <p>
              <span className="head-icon" data-tint="violet">
                {Icon.sparkle}
              </span>
              AI trade assistant
            </p>
            <h2>{thread.length ? (turn ? "New case & shipment" : "Conversation") : "Ask about a shipment, your cases or the procedures"}</h2>
          </div>
          <button type="button" className="chat-new" onClick={startOver} aria-label="New conversation" title="New conversation">
            +
          </button>
        </div>

        {thread.length ? (
          <div className="chat-thread" ref={scroller} role="log" aria-label="Conversation">
            {thread.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="bubble" data-role="user">
                  <p className="bubble-text">{m.text}</p>
                </div>
              ) : (
                <AgentReply
                  key={m.id}
                  stages={m.stages}
                  routed={m.routed}
                  body={m.body}
                  error={m.error}
                  live={m === last}
                  shownCaseId={shown?.caseId ?? null}
                  onShowCase={(id, title) => {
                    rememberCase(id);
                    setShown({ caseId: id, title });
                  }}
                  onConfirm={confirm}
                  onChange={change}
                  confirming={confirming}
                />
              ),
            )}
          </div>
        ) : null}

        {chips.length && !pending ? (
          <div className="chat-followups" aria-label="Suggested next messages">
            {chips.map((c, i) => (
              <button
                type="button"
                className="prompt"
                key={`${c.text}-${i}`}
                data-resume={i >= chips.length - resume.length || undefined}
                onClick={() => send(c.text, c.label)}
              >
                {c.label}
              </button>
            ))}
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
            Message
          </label>
          <div className="composer">
            <textarea
              id="trade-query"
              name="trade-query"
              ref={input}
              value={query}
              placeholder={asking?.slot ? `Tell me ${SLOT_PROMPT[asking.slot]}, or ask anything…` : "Describe a shipment, ask about your cases or the procedures  ·  press / to focus"}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <button type="submit" className="send" aria-label="Send message" title="Send message" disabled={pending || confirming}>
              <span className="btn-icon">{pending ? Icon.loader : Icon.send}</span>
            </button>
          </div>
        </form>

        {!thread.length ? (
          <div className="quick-prompts" aria-label="Suggestions">
            {pickStarters(supported).map((s) => (
              <button type="button" className="prompt" key={s.id} onClick={() => send(`I want to ${s.direction} ${s.goods} by ${s.mode}`, s.title)}>
                {s.title}
              </button>
            ))}
            {STARTERS.map((s) => (
              <button type="button" className="prompt" key={s.text} onClick={() => send(s.text, s.label)}>
                {s.label}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {recent.length > 1 ? (
        <nav className="recent-cases" aria-label="Recent cases">
          <span className="wf-detail-h">Recent cases</span>
          {recent.map((c) => (
            <button
              key={c.id}
              type="button"
              className="recent-case"
              data-active={shown?.caseId === c.id || undefined}
              aria-pressed={shown?.caseId === c.id}
              title={c.line || c.title}
              onClick={() => {
                rememberCase(c.id);
                setShown({ caseId: c.id, title: c.title });
              }}
            >
              <strong>{c.title}</strong>
              <small>
                {c.id}
                {c.status === "complete" ? " · complete" : ""}
              </small>
            </button>
          ))}
          <Link className="crumb" href="/cases">
            All cases →
          </Link>
        </nav>
      ) : null}

      {shown ? (
        <section className="current-case" aria-label="Current step">
          <StepAssistant key={shown.caseId} caseId={shown.caseId} compact />
        </section>
      ) : null}
    </>
  );
}
