"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "../icons";
import type { ChatResult, Stage } from "../../modules/assistant/chat";
import type { Routed } from "../../modules/assistant/router";
import type { IntakeTurn } from "../../modules/intake/conversation";
import type { Slot } from "../../modules/intake/draft";

export type ReplyBody = ChatResult | { kind: "opened"; caseId: string; title: string; planSummary: string };

const FIRST_CASES = 4;

const WAITS_ON = { user: "you", agent: "agent", physical: "at the goods" } as const;

const CHANGE_LABEL: Record<Slot, string> = {
  commodity: "Change goods",
  direction: "Change export/import",
  mode: "Change how",
  quantity: "Change how much",
  route: "Change route",
};

/** One assistant message: while it works, the stages as they stream in; once
 *  answered, the answer - with how it was reached folded away underneath. */
export default function AgentReply({
  stages,
  routed,
  body,
  error,
  live,
  shownCaseId,
  onShowCase,
  onConfirm,
  onChange,
  confirming,
}: {
  stages: Stage[];
  routed: Routed | null;
  body: ReplyBody | null;
  error?: string;
  /** The latest message: only it can still confirm or change an intake. */
  live: boolean;
  shownCaseId: string | null;
  onShowCase: (id: string, title: string) => void;
  onConfirm: () => void;
  onChange: (slot: Slot) => void;
  confirming: boolean;
}) {
  const working = !body && !error;
  return (
    <div className="bubble" data-role="assistant" aria-live={working ? "polite" : undefined}>
      {working ? <Trail stages={stages} /> : null}
      {error ? (
        <p className="bubble-text" data-tone="error">
          {error}
        </p>
      ) : null}
      {body ? <Body body={body} live={live} shownCaseId={shownCaseId} onShowCase={onShowCase} onConfirm={onConfirm} onChange={onChange} confirming={confirming} /> : null}
      {body && stages.length ? (
        <details className="bubble-how">
          <summary>How I answered{routed ? ` · ${routed.by === "model" ? (routed.model ?? "model") : "rules"}` : ""}</summary>
          <Trail stages={stages} />
        </details>
      ) : null}
    </div>
  );
}

function Trail({ stages }: { stages: Stage[] }) {
  if (!stages.length) {
    return (
      <p className="bubble-thinking">
        <span className="agent-trail-icon" data-state="running">
          {Icon.loader}
        </span>
        Thinking…
      </p>
    );
  }
  return (
    <ol className="agent-trail" aria-label="What the assistant did">
      {stages.map((s) => (
        <li key={s.id} data-state={s.state}>
          <span className="agent-trail-icon">{s.state === "running" ? Icon.loader : s.state === "done" ? Icon.check : Icon.clock}</span>
          <span>
            <strong>{s.label}</strong>
            {s.detail ? <small>{s.detail}</small> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Body({
  body,
  live,
  shownCaseId,
  onShowCase,
  onConfirm,
  onChange,
  confirming,
}: {
  body: ReplyBody;
  live: boolean;
  shownCaseId: string | null;
  onShowCase: (id: string, title: string) => void;
  onConfirm: () => void;
  onChange: (slot: Slot) => void;
  confirming: boolean;
}) {
  const [allCases, setAllCases] = useState(false);

  if (body.kind === "intake") return <Intake turn={body.turn} live={live} onConfirm={onConfirm} onChange={onChange} confirming={confirming} />;

  if (body.kind === "opened") {
    return (
      <>
        <p className="bubble-text">
          <span className="head-icon">{Icon.check}</span>
          Opened case <strong>{body.caseId}</strong> — {body.title}. {body.planSummary}
        </p>
        <p className="bubble-meta">Its current step is shown below the chat.</p>
      </>
    );
  }

  if (body.kind === "cases") {
    const cases = body.answer.cases;
    const listed = allCases ? cases : cases.slice(0, FIRST_CASES);
    return (
      <>
        <p className="bubble-text">{body.answer.answer}</p>
        {listed.length ? (
          <ul className="agent-cases">
            {listed.map((c) => {
              const next = c.openSteps.find((s) => s.lane === "user") ?? c.openSteps[0];
              return (
                <li key={c.id} data-status={c.status}>
                  <div className="agent-case-head">
                    <strong>{c.title}</strong>
                    <small>
                      {c.id} · {c.status}
                    </small>
                  </div>
                  {c.line ? <small className="agent-case-line">{c.line}</small> : null}
                  <div className="agent-case-bar" role="img" aria-label={`${c.stagesDone} of ${c.stagesTotal} stages done`}>
                    <span style={{ width: `${c.stagesTotal ? Math.round((c.stagesDone / c.stagesTotal) * 100) : 0}%` }} />
                  </div>
                  <small className="agent-case-line">
                    {c.stagesDone}/{c.stagesTotal} stages{c.running.length ? ` · ${c.running.length} in progress` : ""}
                    {next ? ` · step ${next.stepNum} “${next.title}” (${WAITS_ON[next.lane]})` : ""}
                  </small>
                  <div className="agent-case-actions">
                    <button type="button" className="intake-link" disabled={shownCaseId === c.id} onClick={() => onShowCase(c.id, c.title)}>
                      {shownCaseId === c.id ? "Shown below" : "Show below"}
                    </button>
                    <Link className="intake-link" href={`/cases/${c.id}`}>
                      Open case
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
        {cases.length > FIRST_CASES ? (
          <button type="button" className="intake-link" onClick={() => setAllCases((v) => !v)}>
            {allCases ? "Show fewer" : `Show all ${cases.length} cases`}
          </button>
        ) : null}
        <p className="bubble-meta">From your cases{body.answer.by === "model" && body.answer.model ? `, written by ${body.answer.model}` : ""}.</p>
      </>
    );
  }

  if (body.kind === "knowledge") {
    const { answer, faq } = body;
    const showFaq = !answer.found && faq.length > 0;
    return (
      <>
        {answer.found && answer.answer ? (
          <p className="bubble-text">{answer.answer}</p>
        ) : (
          <p className="bubble-text">
            {showFaq
              ? "Here's what the FAQ says:"
              : answer.sources.length
                ? "I couldn't find a direct answer in the published procedures. These passages come closest:"
                : "Nothing in the procedures matches that question."}
          </p>
        )}
        {showFaq ? (
          <ul className="agent-faq">
            {faq.map((f) => (
              <li key={f.id}>
                <strong>{f.question}</strong>
                <span>{f.answer.join(" ")}</span>
                {f.link ? (
                  <Link className="intake-link" href={f.link.href}>
                    {f.link.label}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {answer.sources.length && !showFaq ? (
          <details className="bubble-sources">
            <summary>
              {answer.found ? "Sources" : "Closest passages"} ({answer.sources.length})
            </summary>
            <ol className="faq-sources">
              {answer.sources.map((s) => (
                <li key={s.id}>
                  <strong>{s.href ? <Link href={s.href}>{s.title}</Link> : s.title}</strong>
                  <span>{s.text}</span>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
        <p className="bubble-meta">
          From the published procedures{answer.by === "model" && answer.model ? `, written by ${answer.model}` : ""} ·{" "}
          <Link className="intake-link" href={`/faq?q=${encodeURIComponent(answer.question)}`}>
            More in the FAQ
          </Link>
        </p>
      </>
    );
  }

  return <p className="bubble-text">{body.message}</p>;
}

/** An intake question, or the summary to confirm - in words, not a form. */
function Intake({
  turn,
  live,
  onConfirm,
  onChange,
  confirming,
}: {
  turn: IntakeTurn;
  live: boolean;
  onConfirm: () => void;
  onChange: (slot: Slot) => void;
  confirming: boolean;
}) {
  const known = turn.progress.filter((row) => row.value);
  return (
    <>
      {known.length ? (
        <p className="bubble-sofar">
          {known.map((row) => (
            <span key={row.slot} data-done={row.done || undefined}>
              {row.done ? <span className="bubble-tick">{Icon.check}</span> : null}
              {row.value}
            </span>
          ))}
        </p>
      ) : null}
      <p className="bubble-text">{turn.message}</p>
      {turn.notes.length ? (
        <ul className="bubble-notes">
          {turn.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      {turn.status === "confirm" && turn.summary ? (
        <div className="bubble-confirm">
          <p>
            <strong>{turn.summary.title}</strong> · procedure {turn.summary.procedureId} · {turn.summary.steps} steps
            <br />
            {turn.summary.what} · {turn.summary.howMuch} · {turn.summary.route}
          </p>
          {live ? (
            <div className="bubble-confirm-actions">
              <button type="button" className="intake-create" onClick={onConfirm} disabled={confirming}>
                {confirming ? "Creating…" : "Create case & steps"}
              </button>
              {turn.progress.map((row) => (
                <button type="button" className="intake-link" key={row.slot} onClick={() => onChange(row.slot)} disabled={confirming}>
                  {CHANGE_LABEL[row.slot]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
