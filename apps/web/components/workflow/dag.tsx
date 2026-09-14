"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../icons";
import { ACTORS, actorOfStep } from "../../modules/procedures/actors";
import { ACTIONS, actionOfStep, blockColumn, blockDelegation, blockDelegationReason, delegationOfStep, LANES, physicalTouchpoints, requiresPhysical, type Lane } from "../../modules/procedures/delegation";
import type { Procedure, ProcedureBlock } from "../../modules/procedures/data/procedures.generated";
import { criticalPath, deriveStates, fmtHours, fmtRange, levelsOf, procedureStats, type BlockState } from "../../modules/procedures/dag";
import { checklistFor, type DocumentState } from "../../modules/documents/checklist";

export type CaseBlockState = { state: BlockState; actualHours: number | null };
export type WorkflowDag = {
  shipment: { goods: string; quantity: number | null; unit: string | null; origin: string | null; destination: string | null; mode: string | null };
  current: { nodeId: string; blockId: string; stepNum: number; title: string; lane: Lane; state: string } | null;
  nodes: { id: string; blockId: string; stepNum: number; title: string; lane: Lane; state: string; action: { workItemId: string; kind: "complete_mock" } | null }[];
};

type Props = {
  procedure: Procedure;
  /** Per-block progress. Omit for the template view (procedure page). */
  progress?: Record<string, CaseBlockState>;
  /** The Document Intelligence agent's checklist state - drives the
   *  "outstanding requirements" indicator on a block and its drawer. Omit
   *  for the template view; there is no case to check completeness against. */
  documentState?: DocumentState;
  /** Present only on a live case: advances a block. */
  onComplete?: (blockId: string) => void;
  busy?: boolean;
  workflow?: WorkflowDag;
  onCompleteCurrent?: () => void;
  /** Present on a live case: stamps payment references. */
  caseId?: string;
};

type Edge = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  done: boolean;
  live: boolean;
  critical: boolean;
};

type Hover = { block: ProcedureBlock; x: number; y: number } | null;

export default function Dag({ procedure, progress, documentState, onComplete, busy, workflow, onCompleteCurrent, caseId }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [edges, setEdges] = useState<Edge[]>([]);

  const gridRef = useRef<HTMLDivElement>(null);
  const nodeEls = useRef(new Map<string, HTMLElement>());

  const blocks = procedure.blocks;
  const levels = useMemo(() => levelsOf(blocks), [blocks]);
  const path = useMemo(() => criticalPath(blocks), [blocks]);
  const stats = useMemo(() => procedureStats(procedure), [procedure]);

  /* Without a case, show the plan: everything waiting. With one, use the stored
     state so the diagram reflects the database rather than a local guess. */
  const states = useMemo(() => {
    if (!progress) {
      const done = new Set<string>();
      return deriveStates(blocks, done);
    }
    const map = new Map<string, BlockState>();
    for (const b of blocks) map.set(b.id, progress[b.id]?.state ?? "waiting");
    return map;
  }, [blocks, progress]);

  const doneCount = [...states.values()].filter((s) => s === "done").length;

  /* Column = the most binding constraint on the block, not a majority vote.
     Physical beats Agent beats User, so each column means something: needs
     the goods / partly automatable / entirely on you. The per-node mix bar
     carries the finer detail. */
  const columnOf = useCallback((b: ProcedureBlock) => blockColumn(b), []);

  const cells = useMemo(() => {
    const map = new Map<string, ProcedureBlock[]>();
    for (const b of blocks) {
      const key = `${columnOf(b)}:${levels.get(b.id) ?? 0}`;
      map.set(key, [...(map.get(key) ?? []), b]);
    }
    return [...map.entries()].map(([key, list]) => {
      const [lane, level] = key.split(":");
      return { lane: lane as Lane, level: Number(level), blocks: list };
    });
  }, [blocks, levels, columnOf]);

  /** Stage gutter: the source data has no named phases, so stages are the
      dependency levels, labelled with how much work sits at each. */
  const stages = useMemo(() => {
    const maxLevel = Math.max(...[...levels.values()]);
    return Array.from({ length: maxLevel + 1 }, (_, level) => {
      const at = blocks.filter((b) => (levels.get(b.id) ?? 0) === level);
      const worst = Math.max(...at.map((b) => b.estDuration[1]));
      return { level, count: at.length, worst };
    });
  }, [blocks, levels]);

  const measure = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const base = grid.getBoundingClientRect();
    const next: Edge[] = [];

    for (const b of blocks) {
      const to = nodeEls.current.get(b.id);
      if (!to) continue;
      const tr = to.getBoundingClientRect();

      for (const dep of b.dependsOn) {
        const fromEl = nodeEls.current.get(dep);
        if (!fromEl) continue;
        const fr = fromEl.getBoundingClientRect();
        next.push({
          id: `${dep}->${b.id}`,
          x1: fr.left + fr.width / 2 - base.left,
          y1: fr.bottom - base.top,
          x2: tr.left + tr.width / 2 - base.left,
          y2: tr.top - base.top,
          done: states.get(dep) === "done" && states.get(b.id) === "done",
          live: states.get(dep) === "done" && states.get(b.id) !== "done",
          critical: path.has(dep) && path.has(b.id),
        });
      }
    }
    setEdges(next);
  }, [blocks, states, path]);

  useLayoutEffect(() => measure(), [measure]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(grid);
    return () => ro.disconnect();
  }, [measure]);

  const registerNode = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) nodeEls.current.set(id, el);
      else nodeEls.current.delete(id);
    },
    [],
  );

  const detail = selected ? blocks.find((b) => b.id === selected) ?? null : null;
  const usedLanes = useMemo(() => {
    const present = new Set(blocks.map(columnOf));
    return LANES.filter((l) => present.has(l.id));
  }, [blocks, columnOf]);

  const kpis = [
    { label: "Blocks", value: `${doneCount}/${blocks.length}`, sub: "complete" },
    { label: "Steps", value: `${procedure.stepsCount}`, sub: `${stats.online} online · ${stats.inPerson} in person` },
    { label: "Critical path", value: fmtHours(stats.pathHours), sub: `${stats.path.size} of ${blocks.length} blocks` },
    { label: "Agent-executed", value: `${stats.automationPct}%`, sub: `${stats.agentSteps} of ${procedure.stepsCount} steps` },
    { label: "Handoffs", value: `${stats.handoffs}`, sub: "control changes hands" },
    { label: "Physical", value: `${physicalTouchpoints(blocks)}`, sub: "blocks needing the goods" },
    { label: "Bodies", value: `${stats.entities}`, sub: "entities involved" },
  ];

  return (
    <section className="wf" aria-label={`${procedure.title} workflow`}>
      <header className="wf-head">
        <div className="section-head">
          <p>
            <span className="head-icon">{Icon.flow}</span>
            Procedure {procedure.id}
          </p>
          <h2>{procedure.title}</h2>
        </div>
        <div className="wf-status">
          <span className="wf-count">
            published {fmtRange(procedure.timeframe)}
          </span>
          {progress ? (
            <div
              className="wf-bar"
              role="progressbar"
              aria-valuenow={doneCount}
              aria-valuemin={0}
              aria-valuemax={blocks.length}
            >
              <span style={{ width: `${(doneCount / blocks.length) * 100}%` }} />
            </div>
          ) : null}
        </div>
      </header>

      <ul className="wf-kpis">
        {kpis.map((k) => (
          <li key={k.label}>
            <span className="wf-kpi-label">{k.label}</span>
            <strong>{k.value}</strong>
            <small>{k.sub}</small>
          </li>
        ))}
      </ul>

      <p className="wf-callout" data-tone="insight">
        <span className="wf-callout-icon">{Icon.compliance}</span>
        <strong>{stats.bottleneck.name}</strong> is the critical-path bottleneck at{" "}
        {fmtRange(stats.bottleneck.estDuration)} — {stats.bottleneckShare}% of the planned
        critical path. Work off that chain has slack and will not move the delivery date.
      </p>

      {workflow ? <CurrentStep workflow={workflow} procedure={procedure} caseId={caseId} busy={busy} onComplete={onCompleteCurrent} /> : null}

      <ul className="wf-legend">
        <li data-state="done">
          <span className="wf-legend-mark">{Icon.check}</span>Complete
        </li>
        <li data-state="running">
          <span className="wf-legend-mark">{Icon.loader}</span>Ready
        </li>
        <li data-state="waiting">
          <span className="wf-legend-mark">{Icon.clock}</span>Waiting
        </li>
        <li className="wf-legend-sep" aria-hidden="true" />
        {usedLanes.map((l) => (
          <li key={l.id} className="wf-legend-lane" data-lane={l.id}>
            <span className="wf-legend-dot" />
            {l.label}
          </li>
        ))}
        <li className="wf-legend-sep" aria-hidden="true" />
        <li className="wf-legend-crit">
          <span className="wf-legend-crit-line" />
          Critical path
        </li>
      </ul>

      <div className="wf-body" data-open={detail ? "true" : "false"}>
        <div className="wf-scroll">
          <div
            className="wf-grid"
            ref={gridRef}
            style={{ gridTemplateColumns: `104px repeat(${usedLanes.length}, minmax(200px, 1fr))` }}
          >
            {stages.map((s) => (
              <div key={s.level} className="wf-phase" style={{ gridColumn: 1, gridRow: s.level + 2 }}>
                <span className="wf-phase-label">Stage {s.level + 1}</span>
                <span className="wf-phase-blurb">
                  {s.count} block{s.count === 1 ? "" : "s"} · ≤{fmtHours(s.worst)}
                </span>
              </div>
            ))}

            {usedLanes.map((l, i) => (
              <div
                key={`band-${l.id}`}
                className="wf-band"
                data-lane={l.id}
                style={{ gridColumn: i + 2, gridRow: "1 / -1" }}
              />
            ))}

            <div className="wf-phase-head" style={{ gridColumn: 1, gridRow: 1 }}>
              Stage
            </div>

            {usedLanes.map((l, i) => (
              <div
                key={`head-${l.id}`}
                className="wf-lane-head"
                data-lane={l.id}
                style={{ gridColumn: i + 2, gridRow: 1 }}
                title={l.blurb}
              >
                {l.label}
              </div>
            ))}

            <svg className="wf-edges" aria-hidden="true">
              <defs>
                {[
                  ["wf-arrow", "var(--line-2)"],
                  ["wf-arrow-live", "var(--accent)"],
                  ["wf-arrow-done", "var(--ok-line)"],
                ].map(([id, fill]) => (
                  <marker
                    key={id}
                    id={id}
                    viewBox="0 0 10 10"
                    refX="8.5"
                    refY="5"
                    markerWidth="5.5"
                    markerHeight="5.5"
                    orient="auto-start-reverse"
                  >
                    <path d="M1 1 9 5 1 9z" fill={fill} />
                  </marker>
                ))}
              </defs>
              {edges.map((e) => {
                const dy = Math.max(22, (e.y2 - e.y1) / 2);
                return (
                  <path
                    key={e.id}
                    className={`wf-edge${e.done ? " is-done" : ""}${e.live ? " is-live" : ""}${e.critical ? " is-critical" : ""}`}
                    d={`M${e.x1},${e.y1} C${e.x1},${e.y1 + dy} ${e.x2},${e.y2 - dy} ${e.x2},${e.y2}`}
                    markerEnd={`url(#${e.done ? "wf-arrow-done" : e.live ? "wf-arrow-live" : "wf-arrow"})`}
                  />
                );
              })}
            </svg>

            {cells.map((cell) => (
              <div
                key={`${cell.lane}-${cell.level}`}
                className="wf-cell"
                style={{
                  gridColumn: usedLanes.findIndex((l) => l.id === cell.lane) + 2,
                  gridRow: cell.level + 2,
                }}
              >
                {cell.blocks.map((b) => {
                  const state = states.get(b.id) ?? "waiting";
                  const actual = progress?.[b.id]?.actualHours ?? null;
                  const missing = documentState ? checklistFor(b, documentState).missing.length : 0;
                  const physical = requiresPhysical(b);
                  const flagAmend = missing > 0 && state !== "done";
                  const flagOptional = !physical && missing === 0 && (b.optionalSteps.length > 0 || b.altSteps.length > 0);
                  const flagCount = Number(flagAmend) + Number(physical) + Number(flagOptional);
                  return (
                    <button
                      key={b.id}
                      ref={registerNode(b.id)}
                      type="button"
                      className="wf-node"
                      data-state={state}
                      data-lane={cell.lane}
                      data-critical={path.has(b.id) ? "true" : "false"}
                      data-selected={selected === b.id ? "true" : "false"}
                      data-current={workflow?.current?.blockId === b.id ? "true" : "false"}
                      data-flags={flagCount || undefined}
                      onClick={() => setSelected(selected === b.id ? null : b.id)}
                      onMouseEnter={(e) =>
                        setHover({ block: b, x: e.clientX, y: e.clientY })
                      }
                      onMouseMove={(e) => setHover({ block: b, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHover(null)}
                      aria-label={`${b.name} — ${workflow?.current?.blockId === b.id ? `current at step ${workflow.current.stepNum}` : state}`}
                    >
                      <span className="wf-node-mark" aria-hidden="true">
                        {state === "done" ? Icon.check : state === "running" ? Icon.loader : Icon.clock}
                      </span>
                      <span className="wf-node-body">
                        <strong>{b.name}</strong>
                        <small>
                          steps {b.stepRange[0]}–{b.stepRange[1]}
                        </small>
                      </span>
                      <span className="wf-node-foot">
                        <span className="wf-node-state">
                          {state === "done" ? "Complete" : state === "running" ? "Ready" : "Waiting"}
                        </span>
                        <span className="wf-node-dur">
                          {actual != null ? fmtHours(actual) : fmtRange(b.estDuration)}
                        </span>
                      </span>
                      {/* Majority decides the column; this shows the rest of
                          the mix so part-physical work is never invisible. */}
                      <span className="wf-node-mix" aria-hidden="true">
                        {blockDelegation(b).counts.map((c) => (
                          <i key={c.lane} data-lane={c.lane} style={{ flexGrow: c.count }} />
                        ))}
                      </span>
                      {/* Badges stack rather than compete: a block can both
                          need documents AND need the goods present, and
                          hiding either would lose the point of the lane. */}
                      <span className="wf-node-flags">
                        {flagAmend ? (
                          <span className="wf-node-flag" data-tone="amend" title={`${missing} document(s) outstanding`}>
                            {Icon.documents}
                          </span>
                        ) : null}
                        {physical ? (
                          <span className="wf-node-flag" data-tone="physical" title="Needs the goods physically present">
                            {Icon.physical}
                          </span>
                        ) : null}
                        {flagOptional ? (
                          <span className="wf-node-flag" title="Has optional or alternative steps">
                            {Icon.list}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {detail ? (
          <BlockDetail
            block={detail}
            state={states.get(detail.id) ?? "waiting"}
            actual={progress?.[detail.id]?.actualHours ?? null}
            onCritical={path.has(detail.id)}
            blocks={blocks}
            documentState={documentState}
            onClose={() => setSelected(null)}
            onComplete={onComplete}
            busy={busy}
          />
        ) : null}
      </div>

      {hover ? <HoverCard hover={hover} actual={progress?.[hover.block.id]?.actualHours ?? null} workflow={workflow} /> : null}
    </section>
  );
}

/** Platform reference for a payment step - quoted with the payment so the
 *  receipt can be matched back to this case and step. The agent generates it;
 *  the trader pays. Moving money is out of scope until a payment connector
 *  exists (most payment steps sit on hosts outside the integrated portals). */
const paymentReference = (caseId: string, stepNum: number) => `${caseId}-P${String(stepNum).padStart(2, "0")}`;

function CurrentStep({
  workflow,
  procedure,
  caseId,
  busy,
  onComplete,
}: {
  workflow: WorkflowDag;
  procedure: Procedure;
  caseId?: string;
  busy?: boolean;
  onComplete?: () => void;
}) {
  const current = workflow.current;
  const shipment = workflow.shipment;
  const route = [shipment.origin, shipment.destination].filter(Boolean).join(" to ");
  const quantity = shipment.quantity ? `${shipment.quantity} ${shipment.unit ?? ""}`.trim() : "";
  const step = current
    ? procedure.blocks.find((b) => b.id === current.blockId)?.steps.find((x) => x.num === current.stepNum)
    : undefined;
  const action = step ? actionOfStep(step) : null;
  const spec = action ? ACTIONS[action] : null;
  return (
    <div className="wf-current" data-lane={current?.lane}>
      <div>
        <small>{[quantity, shipment.goods, route, shipment.mode ? `by ${shipment.mode}` : ""].filter(Boolean).join(" · ")}</small>
        {current ? (
          <p>
            <strong>Current: step {current.stepNum}</strong> {current.title}
            {spec ? <span className="wf-current-action" data-action={action}>{spec.label}</span> : null}
          </p>
        ) : (
          <p><strong>Workflow complete</strong></p>
        )}
        {spec && step ? (
          <small className="wf-current-agent">
            {step.entity ? <>{step.entity} · </> : null}Agent: {spec.agent}
            {action === "pay" && caseId && current ? (
              <>
                {" "}Reference <code>{paymentReference(caseId, current.stepNum)}</code>.
              </>
            ) : null}
          </small>
        ) : null}
      </div>
      {current?.lane === "user" && onComplete ? (
        <button type="button" onClick={onComplete} disabled={busy}>
          {busy ? "Saving…" : spec?.confirm || "Complete & verify"}
        </button>
      ) : current?.lane === "physical" ? (
        <Link href="/entities">Open entity task</Link>
      ) : null}
    </div>
  );
}

/* Hover: expected versus actual, why the orchestrator delegated it here, and
   why the dependency exists - the three questions someone looking at a
   stalled case actually has. */
function HoverCard({ hover, actual, workflow }: { hover: NonNullable<Hover>; actual: number | null; workflow?: WorkflowDag }) {
  const b = hover.block;
  // Must be the COLUMN, not the majority lane: they disagree on 32 of the 54
  // blocks, and labelling by majority contradicts where the node is drawn.
  const column = blockColumn(b);
  const reason = blockDelegationReason(b);
  const variance = actual != null ? actual - b.estDuration[1] : null;
  const nodeState = new Map(workflow?.nodes.map((node) => [node.stepNum, node.state]) ?? []);
  const currentIndex = workflow?.current?.blockId === b.id
    ? Math.max(0, b.steps.findIndex((step) => step.num === workflow.current?.stepNum))
    : 0;
  const preview = b.steps.slice(currentIndex, currentIndex + 3);

  return (
    <div
      className="dag-tip"
      style={{
        left: Math.max(12, Math.min(hover.x + 16, window.innerWidth - 292)),
        top: Math.max(12, Math.min(hover.y + 16, window.innerHeight - 290)),
      }}
      role="tooltip"
    >
      <strong>{b.name}</strong>
      <dl>
        <div>
          <dt>Expected</dt>
          <dd>{fmtRange(b.estDuration)}</dd>
        </div>
        <div>
          <dt>Actual</dt>
          <dd>{actual != null ? fmtHours(actual) : "—"}</dd>
        </div>
        {variance != null ? (
          <div>
            <dt>Variance</dt>
            <dd data-tone={variance > 0 ? "over" : "under"}>
              {variance > 0 ? "+" : ""}
              {fmtHours(Math.abs(variance))} {variance > 0 ? "over" : "under"}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Steps</dt>
          <dd>
            {b.steps.length} ({b.stepRange[0]}–{b.stepRange[1]})
          </dd>
        </div>
      </dl>
      <ol className="dag-tip-steps">
        {preview.map((step) => (
          <li key={step.num} data-current={workflow?.current?.stepNum === step.num ? "true" : "false"}>
            <span>{step.num}</span>{step.title}
            <em>{nodeState.get(step.num) === "completed" ? "Done" : workflow?.current?.stepNum === step.num ? "Now" : "Next"}</em>
          </li>
        ))}
      </ol>
      {/* One delegation sentence: it already carries the lane breakdown in
          its parenthetical, so chips repeating those counts were noise. */}
      <p className="dag-tip-why">
        <strong>Why {LANES.find((l) => l.id === column)?.label.toLowerCase()}: </strong>
        {reason}
      </p>
      <p className="dag-tip-why">{b.dependencyReason}</p>
    </div>
  );
}

function BlockDetail({
  block,
  state,
  actual,
  onCritical,
  blocks,
  documentState,
  onClose,
  onComplete,
  busy,
}: {
  block: ProcedureBlock;
  state: BlockState;
  actual: number | null;
  onCritical: boolean;
  blocks: ProcedureBlock[];
  documentState?: DocumentState;
  onClose: () => void;
  onComplete?: (blockId: string) => void;
  busy?: boolean;
}) {
  const mix = blockDelegation(block);
  const column = blockColumn(block);
  const reason = blockDelegationReason(block);
  const checklist = documentState ? checklistFor(block, documentState) : null;

  return (
    <aside className="wf-detail" aria-label={`${block.name} detail`}>
      <header>
        {/* The column, so the badge agrees with where the node is drawn. */}
        <span className="wf-detail-lane" data-lane={column}>
          {LANES.find((l) => l.id === column)?.label}
        </span>
        <button type="button" className="wf-detail-close" onClick={onClose} aria-label="Close detail">
          ×
        </button>
      </header>
      <h3>{block.name}</h3>
      <p className="wf-detail-reason">
        <strong>Orchestrator: </strong>
        {reason}
      </p>
      <p>{block.dependencyReason}</p>

      <dl className="wf-detail-grid">
        <div>
          <dt>Status</dt>
          <dd data-state={state}>{state}</dd>
        </div>
        <div>
          <dt>Expected</dt>
          <dd>{fmtRange(block.estDuration)}</dd>
        </div>
        {actual != null ? (
          <div>
            <dt>Actual</dt>
            <dd>{fmtHours(actual)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Critical path</dt>
          <dd>{onCritical ? "Yes" : "No — has slack"}</dd>
        </div>
        <div>
          <dt>Steps</dt>
          <dd>
            {block.stepRange[0]}–{block.stepRange[1]}
          </dd>
        </div>
      </dl>

      {checklist && checklist.required.length ? (
        <div className="wf-detail-block">
          <span className="wf-detail-h">
            Document Intelligence — {checklist.missing.length ? `${checklist.missing.length} outstanding` : "complete"}
          </span>
          <ul className="dag-checklist">
            {checklist.required.map((r) => {
              const provided = !checklist.missing.some((m) => m.stepNum === r.stepNum);
              return (
                <li key={r.stepNum} data-provided={provided ? "true" : "false"}>
                  <span className="dag-checklist-mark" aria-hidden="true">
                    {provided ? Icon.check : Icon.clock}
                  </span>
                  <span>
                    {r.output}
                    {r.optional ? <em> (optional)</em> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="wf-detail-block">
        <span className="wf-detail-h">Delegated to</span>
        <div className="dag-actor-chips">
          {mix.counts.map((c) => (
            <span key={c.lane} data-lane={c.lane}>
              {LANES.find((l) => l.id === c.lane)?.label}
              <em>{c.count}</em>
            </span>
          ))}
        </div>
        {requiresPhysical(block) ? (
          <p className="dag-physical-note">Needs the goods physically present — cannot be fully automated.</p>
        ) : null}
      </div>

      <div className="wf-detail-block">
        <span className="wf-detail-h">Deals with</span>
        <div className="dag-actor-chips">
          {[...new Set(block.steps.map((s) => actorOfStep(s)))].map((a) => (
            <span key={a} data-counterparty={a}>
              {ACTORS.find((x) => x.id === a)?.label}
            </span>
          ))}
        </div>
      </div>

      <div className="wf-detail-block">
        <span className="wf-detail-h">Depends on</span>
        {block.dependsOn.length ? (
          <ul>
            {block.dependsOn.map((d) => (
              <li key={d}>{blocks.find((b) => b.id === d)?.name ?? d}</li>
            ))}
          </ul>
        ) : (
          <p>Independent track — can start as soon as the case opens.</p>
        )}
      </div>

      <div className="wf-detail-block">
        <span className="wf-detail-h">Steps</span>
        <ol className="dag-steps">
          {block.steps.map((s) => {
            const { lane, reason: stepReason } = delegationOfStep(s);
            return (
              <li key={s.num} data-optional={s.optional ? "true" : "false"}>
                <span className="dag-step-num">{s.num}</span>
                <span className="dag-step-main">
                  <strong>{s.title}</strong>
                  <em>{s.entity}</em>
                  <span className="dag-step-meta">
                    <span data-channel={/^online/i.test(s.channel) ? "online" : "person"}>{s.channel}</span>
                    <span data-lane={lane} title={stepReason}>
                      {LANES.find((l) => l.id === lane)?.label}
                    </span>
                    <span data-action={actionOfStep(s)} title={ACTIONS[actionOfStep(s)].agent}>
                      {ACTIONS[actionOfStep(s)].label}
                    </span>
                    {s.optional ? <span data-flag="opt">optional</span> : null}
                    {s.alternative ? <span data-flag="alt">alternative</span> : null}
                  </span>
                  {s.output ? <span className="dag-step-out">→ {s.output}</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {onComplete && state === "running" ? (
        <button type="button" disabled={busy} onClick={() => onComplete(block.id)}>
          {busy ? "Saving…" : "Mark block complete"}
        </button>
      ) : null}
    </aside>
  );
}
