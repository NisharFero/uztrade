"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "../icons";
import { hours, LANE_LABEL, plural } from "../dashboard/format";
import type { CaseDigest } from "../../modules/assistant/cases";
import type { EstimateOption, ShipmentNeeds } from "../../modules/assistant/intention";
import type { RiskReport, RiskRow } from "../../modules/compliance/risk";
import type { Passage } from "../../modules/faq/answer";
import type { IntakeTurn } from "../../modules/intake/conversation";
import type { AssistantView } from "../../modules/steps/assistant";

/*
 * What a reply shows instead of saying it.
 *
 * Each card is the data the agent already had - the ways the goods can go,
 * the plan, the cases, the risk rows - laid out to be scanned and tapped. The
 * words above a card say what it is in one line; the card carries the rest.
 * Every tap either sends a message the trader could have typed, or opens
 * something they could have navigated to: a card never does anything the
 * conversation could not.
 */

const svg = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const MODE_GLYPH: Record<string, React.ReactNode> = {
  road: Icon.truck,
  rail: svg(
    <>
      <rect x="6" y="3" width="12" height="13" rx="3" />
      <path d="M6 10h12M9 20l-2 2M15 20l2 2M9 16v.01M15 16v.01" />
    </>,
  ),
  air: svg(<path d="M10.5 3.5 12 3l1.5.5V9l7 4v2l-7-2v4.5l2 1.5v1.5l-3.5-1-3.5 1V19l2-1.5V13l-7 2v-2l7-4z" />),
};
MODE_GLYPH.train = MODE_GLYPH.rail;

const cap = (s: string) => (s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}` : s);
const modeWord = (m: string) => (m === "rail" || m === "train" ? "train" : m === "air" ? "air" : "road");

/* ------------------------------------------------------------ the ways --- */

/**
 * Every published way the goods can go, as tiles to pick from. The bar under
 * each is the point of the platform said without a sentence: the published
 * time, and how much of it is left with the agents filing.
 */
export function WaysCard({
  goods,
  options,
  from,
  to,
  assumed = [],
  needs,
  disabled,
  onPick,
}: {
  goods: string;
  options: EstimateOption[];
  from?: string | null;
  to?: string | null;
  assumed?: string[];
  needs?: ShipmentNeeds | null;
  disabled?: boolean;
  onPick: (text: string) => void;
}) {
  // Every bar is paperwork time, on one scale: the slowest published way.
  const longest = Math.max(...options.map((o) => o.published[1]), 1);
  const route = from && to ? ` from ${from} to ${to}` : "";
  return (
    <div className="rcard ways" role="group" aria-label={`Ways to move ${goods}`}>
      <ul className="ways-list">
        {options.map((o) => {
          const quicker = o.paperwork[1] < o.published[1];
          return (
            <li key={o.procedureId}>
              <button
                type="button"
                className="way"
                disabled={disabled}
                onClick={() => onPick(`I want to ${o.direction} ${goods} by ${modeWord(o.mode)}${route}`)}
              >
                <span className="way-glyph" aria-hidden="true">
                  {MODE_GLYPH[o.mode] ?? Icon.flow}
                </span>
                <span className="way-main">
                  <span className="way-title">
                    {cap(o.direction)} by {modeWord(o.mode)}
                    <span className="way-id">{o.procedureId}</span>
                  </span>
                  <span className="way-meta">
                    {plural(o.steps, "step")} · usually {hours(o.published)}
                    {o.transit ? ` · ${hours(o.transit)} on the way` : ""}
                  </span>
                  <span className="way-bars" aria-hidden="true">
                    <i className="way-bar" style={{ width: `${(o.published[1] / longest) * 100}%` }} />
                    {quicker ? <i className="way-bar way-bar-agents" style={{ width: `${(o.paperwork[1] / longest) * 100}%` }} /> : null}
                  </span>
                  {quicker ? <span className="way-agents">About {hours(o.paperwork)} with the agents filing</span> : null}
                </span>
                <span className="way-go" aria-hidden="true">
                  Plan
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {needs && (needs.documents.length || needs.details.length) ? <NeedsList needs={needs} /> : null}
      {assumed.length ? <p className="rcard-foot">Assumes {assumed.join("; ")}.</p> : null}
    </div>
  );
}

function NeedsList({ needs }: { needs: ShipmentNeeds }) {
  const count = [needs.documents.length ? plural(needs.documents.length, "document") : null, needs.details.length ? plural(needs.details.length, "detail") : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <details className="rcard-needs">
      <summary>
        <span>What you&rsquo;ll need</span>
        <span className="rcard-count">{count}</span>
      </summary>
      <ul>
        {needs.documents.map((d) => (
          <li key={`d-${d}`}>
            <span className="need-kind">Doc</span>
            {d}
          </li>
        ))}
        {needs.details.map((d) => (
          <li key={`f-${d}`}>
            <span className="need-kind need-kind-detail">Detail</span>
            {d}
          </li>
        ))}
      </ul>
      <p className="rcard-foot">Nothing is needed now. Each one is asked for when its step comes up.</p>
    </details>
  );
}

/* ------------------------------------------------------- the shipment --- */

/**
 * The shipment as intake has read it so far: filled slots in ink, the one
 * being asked for marked, the rest faint. Tapping a filled slot starts the
 * correction in the composer - the only edit a chat needs.
 */
export function ShipmentProgress({ turn, disabled, onEdit }: { turn: IntakeTurn; disabled?: boolean; onEdit: (slot: IntakeTurn["progress"][number]["slot"]) => void }) {
  const rows = turn.progress.filter((r) => r.value || r.slot === turn.slot || r.slot !== "regime");
  const filled = rows.filter((r) => r.done).length;
  if (!filled) return null;
  return (
    <div className="rcard facts" aria-label="Your shipment so far">
      <p className="rcard-kicker">
        Your shipment <span className="rcard-count">{filled} of {rows.length}</span>
      </p>
      <dl className="facts-grid">
        {rows.map((r) => (
          <div key={r.slot} className="fact" data-state={r.done ? "done" : r.slot === turn.slot ? "asking" : "empty"}>
            <dt>{r.label}</dt>
            <dd>
              {r.done && r.value ? (
                <button type="button" className="fact-edit" disabled={disabled} title={`Change ${r.label.toLowerCase()}`} onClick={() => onEdit(r.slot)}>
                  {r.value}
                </button>
              ) : r.slot === turn.slot ? (
                "Asking now"
              ) : (
                "—"
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The matched shipment, ready to open: everything the four paragraphs said. */
export function PlanCard({
  turn,
  needs,
  opening,
  disabled,
  onOpen,
}: {
  turn: IntakeTurn;
  needs?: ShipmentNeeds | null;
  opening?: boolean;
  disabled?: boolean;
  onOpen: () => void;
}) {
  const s = turn.summary;
  if (!s) return null;
  const facts: [string, string][] = [
    ["What", s.what],
    ["How much", s.howMuch],
    ["Route", s.route],
    ["How", s.how],
  ];
  return (
    <div className="rcard plan" aria-label="The plan">
      <header className="plan-top">
        <span className="way-glyph" aria-hidden="true">
          {MODE_GLYPH[s.how.toLowerCase().replace(/^by /, "")] ?? Icon.flow}
        </span>
        <div>
          <p className="rcard-kicker">
            {cap(s.direction)} · procedure {s.procedureId}
          </p>
          <h3>{s.caseTitle}</h3>
        </div>
      </header>
      <dl className="facts-grid">
        {facts.map(([k, v]) => (
          <div key={k} className="fact" data-state="done">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="plan-stats">
        <span>
          <strong>{s.steps}</strong> steps
        </span>
        <span>
          <strong>{s.blocks}</strong> stages
        </span>
        <span>Agents file the online parts</span>
      </p>
      {needs && (needs.documents.length || needs.details.length) ? <NeedsList needs={needs} /> : null}
      <div className="plan-actions">
        <button type="button" className="rcard-primary" disabled={disabled} onClick={onOpen}>
          {opening ? "Opening…" : "Open the case"}
        </button>
        <span className="rcard-hint">or just say yes</span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- the cases --- */

/** The cases an answer was about, each one tap from its conversation. */
export function CasesCard({ cases }: { cases: CaseDigest[] }) {
  if (!cases.length) return null;
  return (
    <ul className="rcard cases" aria-label="Cases">
      {cases.slice(0, 6).map((c) => {
        const onYou = c.openSteps.filter((s) => s.lane === "user");
        const pct = c.stagesTotal ? Math.round((c.stagesDone / c.stagesTotal) * 100) : 0;
        return (
          <li key={c.id}>
            <Link className="rcase-row" href={`/dashboard?case=${encodeURIComponent(c.id)}`}>
              <span className="rcase-main">
                <span className="rcase-title">{c.title}</span>
                <span className="rcase-meta">
                  {c.id}
                  {c.line ? ` · ${c.line}` : ""}
                </span>
                <span className="rcase-bar" aria-label={`${c.stagesDone} of ${c.stagesTotal} stages done`}>
                  <i style={{ width: `${pct}%` }} />
                </span>
              </span>
              <span className="rcase-side">
                {c.status === "complete" ? (
                  <span className="pill" data-tone="ok">
                    Done
                  </span>
                ) : onYou.length ? (
                  <span className="pill" data-tone="needs" title={onYou.map((s) => s.title).join(", ")}>
                    {onYou.length} on you
                  </span>
                ) : (
                  <span className="pill">{c.openSteps[0] ? LANE_LABEL[c.openSteps[0].lane] ?? "Open" : "Open"}</span>
                )}
                <span className="rcase-frac">
                  {c.stagesDone}/{c.stagesTotal}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
      {cases.length > 6 ? (
        <li className="rcard-foot">
          <Link href="/cases">and {cases.length - 6} more</Link>
        </li>
      ) : null}
    </ul>
  );
}

/* ---------------------------------------------------------- the sources --- */

export function SourcesCard({ sources }: { sources: Passage[] }) {
  const shown = sources.slice(0, 3);
  if (!shown.length) return null;
  return (
    <p className="sources" aria-label="Sources">
      <span className="sources-label">From</span>
      {shown.map((s, i) =>
        s.href ? (
          <Link key={s.id} className="source" href={s.href}>
            <i>{i + 1}</i>
            {s.title}
          </Link>
        ) : (
          <span key={s.id} className="source">
            <i>{i + 1}</i>
            {s.title}
          </span>
        ),
      )}
    </p>
  );
}

/* ------------------------------------------------------------ the case --- */

/** The orchestrator's hello, as the case at a glance. */
export function CaseCard({ view }: { view: AssistantView }) {
  const k = view.kpis;
  return (
    <div className="rcard casecard" aria-label={`Case ${view.caseId}`}>
      <p className="rcard-kicker">Case {view.caseId}</p>
      <h3>{view.title}</h3>
      <div className="rcase-bar rcase-bar-lg" aria-label={`${k.completed} of ${k.total} steps done`}>
        <i style={{ width: `${k.percent}%` }} />
      </div>
      <dl className="stats">
        <div>
          <dt>Steps</dt>
          <dd>{k.total}</dd>
        </div>
        <div>
          <dt>Agents file</dt>
          <dd>{k.agentTotal}</dd>
        </div>
        <div>
          <dt>Done</dt>
          <dd>{k.completed}</dd>
        </div>
        <div>
          <dt>To go</dt>
          <dd>{hours(k.etaHours)}</dd>
        </div>
      </dl>
    </div>
  );
}

const RISK_TONE: Record<RiskRow["status"], string> = { ok: "ok", pending: "", caution: "needs", high: "bad", unknown: "" };
const RISK_WORD: Record<RiskRow["status"], string> = { ok: "Clear", pending: "Pending", caution: "Check", high: "High", unknown: "Unknown" };

/** The rules that flagged something, each opening to its reason. */
export function RiskCard({ report }: { report: RiskReport }) {
  const flagged = report.rows.filter((r) => r.status === "high" || r.status === "caution");
  const clear = report.rows.filter((r) => r.status === "ok").length;
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="rcard risk" aria-label="Risk check">
      <ul className="risk-list">
        {flagged.map((r) => (
          <li key={r.key}>
            <button type="button" className="risk-row" aria-expanded={open === r.key} onClick={() => setOpen((o) => (o === r.key ? null : r.key))}>
              <span className="pill" data-tone={RISK_TONE[r.status]}>
                {RISK_WORD[r.status]}
              </span>
              <span className="risk-title">{r.title}</span>
              <span className="risk-value">{r.value}</span>
              <span className="risk-caret" aria-hidden="true" />
            </button>
            {open === r.key ? <p className="risk-reason">{r.reason}</p> : null}
          </li>
        ))}
      </ul>
      {clear ? <p className="rcard-foot">{plural(clear, "other rule")} clear.</p> : null}
    </div>
  );
}

/* --------------------------------------------------------- the starters --- */

export type Starter = { kind: string; text: string; glyph: keyof typeof Icon };

/** The first screen's suggestions: what each one does, then the words. */
export function StarterCards({ starters, onPick }: { starters: Starter[]; onPick: (text: string) => void }) {
  return (
    <ul className="starters">
      {starters.map((s) => (
        <li key={s.text}>
          <button type="button" className="starter" onClick={() => onPick(s.text)}>
            <span className="starter-glyph" aria-hidden="true">
              {Icon[s.glyph]}
            </span>
            <span className="starter-kind">{s.kind}</span>
            <span className="starter-text">{s.text}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
