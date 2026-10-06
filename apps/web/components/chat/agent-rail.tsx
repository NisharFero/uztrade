"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons";
import { AGENTS, STATE_LABEL, type AgentId, type AgentState, type AgentStatus } from "../../modules/chat/agents";

const GLYPH: Record<AgentId | "user", React.ReactNode> = {
  user: Icon.user,
  assistant: Icon.sparkle,
  orchestrator: Icon.flow,
  documents: Icon.documents,
  risk: Icon.compliance,
  transit: Icon.truck,
};

/** The one picture of who said something or who is working: the same in the
 *  thread and on the rail, so a reply can be traced back to its agent. */
export function Avatar({ who, state, size = "md" }: { who: AgentId | "user"; state?: AgentState; size?: "sm" | "md" }) {
  return (
    <span className="avatar" data-who={who} data-size={size} aria-hidden="true">
      {GLYPH[who]}
      {state ? <i className="avatar-state" data-state={state} /> : null}
    </span>
  );
}

/**
 * The agents on the case, as a column beside the conversation. Each shows its
 * state at a glance - working, needs you, idle - and opens to say what it is
 * doing right now and why. "Needs you" is the only state that asks for
 * anything, so it is the only one that draws the eye.
 */
export default function AgentRail({ statuses, onFocus }: { statuses: AgentStatus[]; onFocus?: (id: AgentId) => void }) {
  const [open, setOpen] = useState<AgentId | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const current = statuses.find((s) => s.id === open) ?? null;
  const waiting = statuses.filter((s) => s.state === "needs-you").length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    const onDown = (e: PointerEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div className="agent-rail" ref={root}>
      <p className="agent-rail-head" title={waiting ? `${waiting} waiting on you` : "Nothing waiting on you"}>
        Agents
        {waiting ? <span className="agent-rail-count">{waiting}</span> : null}
      </p>
      <ul className="agent-rail-list">
        {statuses.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className="agent-rail-button"
              data-state={s.state}
              aria-expanded={open === s.id}
              aria-label={`${AGENTS[s.id].name}: ${STATE_LABEL[s.state]}`}
              title={`${AGENTS[s.id].name} · ${STATE_LABEL[s.state]}`}
              onClick={() => setOpen((o) => (o === s.id ? null : s.id))}
            >
              <Avatar who={s.id} state={s.state} />
              <span className="agent-rail-name">{AGENTS[s.id].short}</span>
            </button>
          </li>
        ))}
      </ul>
      <ul className="agent-legend" aria-label="What the colours mean">
        {(["working", "needs-you", "idle"] as AgentState[]).map((state) => (
          <li key={state}>
            <i className="avatar-state" data-state={state} />
            {STATE_LABEL[state]}
          </li>
        ))}
      </ul>

      {current ? (
        <section className="agent-card" role="dialog" aria-label={AGENTS[current.id].name}>
          <header>
            <Avatar who={current.id} />
            <div>
              <h3>{AGENTS[current.id].name}</h3>
              <span className="agent-pill" data-state={current.state}>
                {STATE_LABEL[current.state]}
              </span>
            </div>
            <button type="button" className="icon-button" aria-label="Close" onClick={() => setOpen(null)}>
              {Icon.close}
            </button>
          </header>
          <p className="agent-card-label">Right now</p>
          <p className="agent-card-now">{current.now}</p>
          {current.details.length ? (
            <ul className="agent-card-details">
              {current.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          ) : null}
          <p className="agent-card-role">{AGENTS[current.id].role}</p>
          {current.state === "needs-you" && onFocus ? (
            <button
              type="button"
              className="agent-card-go"
              onClick={() => {
                onFocus(current.id);
                setOpen(null);
              }}
            >
              Show me what it needs
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
