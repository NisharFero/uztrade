import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "../../components/icons";
import { delegationOfStep } from "../../modules/procedures/delegation";
import { CATALOGUE, PROCEDURE_IDS, type Procedure, type ProcedureBlock } from "../../modules/procedures/data/procedures.generated";
import { getProcedures } from "../../modules/procedures/registry";
import type { ShipmentFacts } from "../../modules/workflow/domain";
import { listCases } from "../../modules/cases/store";
import { assessCompliance, CERTIFICATE_RULES } from "../../modules/compliance/compliance";
import { requiredOutputsForProcedure, parseDocumentState } from "../../modules/documents/checklist";
import { DOC_SPECS } from "../../modules/documents/specs";
import { collectOnce, INPUT_KINDS } from "../../modules/procedures/requirements";

function factsOf(raw: string | null | undefined): Partial<ShipmentFacts> {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/* What the three analysis agents need to do their job - stated as points, the
 * same lists their panels show on a case. */
const INTAKE_NEEDS = [
  "Goods — mapped to a commodity category and HS heading",
  "Direction — leaving or entering Uzbekistan (the route can imply it)",
  "Transport mode — or a quantity, so the load picks train or air",
  "Route and quantity — optional; they size the shipment plan",
];
const RISK_NEEDS = [
  "Commodity and HS heading",
  "Direction",
  "Transport mode",
  "Destination (export) or origin (import) country",
  "Transit countries",
  "Quantity",
  "Packaging material",
  "Perishability",
];

export const metadata: Metadata = {
  title: "AI Agent Center · UzTrade",
  description: "Agents, what they are handling now, and what they have completed.",
};

export const dynamic = "force-dynamic";

/* Agents are defined by the government portals they file against, so each one
 * maps to real steps in the source data rather than being invented. A block is
 * assigned to the agent whose patterns match the most of its steps. */
const AGENTS = [
  {
    id: "singlewindow",
    name: "Single Window Agent",
    icon: Icon.agents,
    covers: "Applications and certificates filed through Single Window",
    match: /single window|singlewindow|state services|my\.gov/i,
  },
  {
    id: "phyto",
    name: "Phytosanitary Agent",
    icon: Icon.compliance,
    covers: "Quarantine offers, inspections, fumigation and certificates",
    match: /quarantine|karantin|efito|assalom|plant/i,
  },
  {
    id: "customs",
    name: "Customs Agent",
    icon: Icon.documents,
    covers: "Declarations, duties and clearance in the customs cabinet",
    match: /customs|declaration|ed1|foreign economic/i,
  },
  {
    id: "rail",
    name: "Transit & Capacity Agent",
    icon: Icon.shipments,
    covers: "Capacity and equipment, bookings, wagon and flight references, and where the cargo is now",
    match: /railway|temir|e-nakl|freight|air|cargo|station|wagon|loading|dispatch/i,
  },
  {
    id: "origin",
    name: "Certification Agent",
    icon: Icon.list,
    covers: "Certificates of origin and expert conclusions",
    match: /expertiza|origin|certificat/i,
  },
] as const;

type Agent = (typeof AGENTS)[number];

function agentForBlock(block: ProcedureBlock): Agent {
  let best: Agent = AGENTS[0];
  let bestScore = -1;
  for (const agent of AGENTS) {
    const score = block.steps.filter(
      (s) => agent.match.test(s.entity) || agent.match.test(s.title) || agent.match.test(s.where),
    ).length;
    if (score > bestScore) {
      best = agent;
      bestScore = score;
    }
  }
  return best;
}

export default async function AgentsPage() {
  let cases: Awaited<ReturnType<typeof listCases>> = [];
  let error: string | null = null;
  try {
    cases = await listCases();
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load cases";
  }

  // Fold every case's blocks into per-agent handling / history.
  const handling = new Map<string, { caseId: string; block: ProcedureBlock; procedureId: string }[]>();
  const history = new Map<string, { caseId: string; block: ProcedureBlock; hours: number | null; procedureId: string }[]>();
  const automatable = new Map<string, number>();

  // Only the procedures the open cases run on are loaded — the agent centre is
  // about work in flight, not about all 243 published procedures.
  const loaded = new Map<string, Procedure>(
    (await getProcedures([...new Set(cases.map((c) => c.procedureId))])).map((p) => [p.id, p]),
  );
  for (const p of loaded.values())
    for (const b of p.blocks) {
      const agent = agentForBlock(b);
      const n = b.steps.filter((s) => delegationOfStep(s).lane === "agent").length;
      automatable.set(agent.id, (automatable.get(agent.id) ?? 0) + n);
    }

  for (const c of cases) {
    const procedure = loaded.get(c.procedureId);
    if (!procedure) continue;
    for (const row of c.blocks) {
      const block = procedure.blocks.find((b) => b.id === row.blockId);
      if (!block) continue;
      const agent = agentForBlock(block);
      if (row.state === "running") {
        handling.set(agent.id, [
          ...(handling.get(agent.id) ?? []),
          { caseId: c.id, block, procedureId: c.procedureId },
        ]);
      } else if (row.state === "done") {
        history.set(agent.id, [
          ...(history.get(agent.id) ?? []),
          { caseId: c.id, block, hours: row.actualHours, procedureId: c.procedureId },
        ]);
      }
    }
  }

  // Analysis agents: live figures across every case.
  let required = 0;
  let verified = 0;
  let missingInputs = 0;
  for (const c of cases) {
    const procedure = loaded.get(c.procedureId);
    if (!procedure) continue;
    required += requiredOutputsForProcedure(procedure).filter((r) => !r.optional).length;
    verified += Object.values(parseDocumentState(c.documentState)).filter((s) => s.provided).length;
    // Packaging is almost never stated, so "any input missing" would count every case.
    // Count the input that blocks a real conclusion: the partner country.
    const partner = assessCompliance(procedure, factsOf(c.shipmentFacts), c.query).inputs.find((i) => i.key === "partner");
    if (!partner?.value) missingInputs++;
  }
  const profileItems = new Set([...loaded.values()].flatMap((p) => collectOnce(p).profile.map((i) => i.label))).size;

  const analysis = [
    {
      id: "intake",
      name: "Intake Agent",
      icon: Icon.sparkle,
      covers: "Turns a query into one procedure and its step plan — or asks for the one missing detail",
      stats: [
        ["Cases opened", cases.length],
        ["Read by the model", cases.filter((c) => c.matchedBy === "llm").length],
        ["Procedures in lookup", PROCEDURE_IDS.length],
      ],
      needs: INTAKE_NEEDS,
    },
    {
      id: "documents",
      name: "Document Intelligence",
      icon: Icon.documents,
      covers: "What each step needs, what each document must contain, and the cross-checks",
      stats: [
        ["Documents verified", `${verified}/${required}`],
        ["Field checklists", Object.keys(DOC_SPECS).length],
        ["Profile items asked once", profileItems],
      ],
      needs: INPUT_KINDS.map((k) => k.label),
    },
    {
      id: "risk",
      name: "Compliance & Risk",
      icon: Icon.compliance,
      covers: "Rules by commodity × direction, the evidence each risk needs, and what it can't conclude yet",
      stats: [
        ["Rule sets", Object.keys(CERTIFICATE_RULES).length],
        ["Cases assessed", cases.length],
        ["No partner country", missingInputs],
      ],
      needs: RISK_NEEDS,
    },
  ] as const;

  return (
    <>
      <header className="page-head">
        <p>
          <span className="head-icon">{Icon.agents}</span>
          AI Agent Center · All Agents
        </p>
        <h1>Agents</h1>
        <p className="page-lede">
          Analysis agents run on every case: they read the query, state what each step needs and assess risk. Filing
          agents own the blocks they can file electronically — &ldquo;handling now&rdquo; is every block currently
          ready across open cases; history is what has already completed.
        </p>
      </header>

      {error ? (
        <p className="query-note" data-tone="error">
          <span className="head-icon">{Icon.clock}</span>
          {error}
        </p>
      ) : null}

      <div className="section-head">
        <p>
          <span className="head-icon" data-tint="violet">
            {Icon.sparkle}
          </span>
          Analysis agents
        </p>
        <h2>Intake, documents and risk</h2>
      </div>

      <div className="agent-grid">
        {analysis.map((agent) => (
          <section className="agent-card" key={agent.id} aria-label={agent.name}>
            <header>
              <span className="agent-icon">{agent.icon}</span>
              <div>
                <h2>{agent.name}</h2>
                <small>{agent.covers}</small>
              </div>
              <mark data-tone="info">every case</mark>
            </header>

            <dl className="agent-stats">
              {agent.stats.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            <div className="agent-list">
              <span className="wf-detail-h">What it needs</span>
              <ul className="agent-needs">
                {agent.needs.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>

      <div className="section-head">
        <p>
          <span className="head-icon">{Icon.agents}</span>
          Filing agents
        </p>
        <h2>Portal work by block</h2>
      </div>

      <div className="agent-grid">
        {AGENTS.map((agent) => {
          const now = handling.get(agent.id) ?? [];
          const past = history.get(agent.id) ?? [];

          return (
            <section className="agent-card" key={agent.id} aria-label={agent.name}>
              <header>
                <span className="agent-icon">{agent.icon}</span>
                <div>
                  <h2>{agent.name}</h2>
                  <small>{agent.covers}</small>
                </div>
                <mark data-tone={now.length ? "info" : "neutral"}>
                  {now.length ? `${now.length} active` : "idle"}
                </mark>
              </header>

              <dl className="agent-stats">
                <div>
                  <dt>Handling now</dt>
                  <dd>{now.length}</dd>
                </div>
                <div>
                  <dt>Completed</dt>
                  <dd>{past.length}</dd>
                </div>
                <div>
                  <dt>Automatable steps</dt>
                  <dd>{automatable.get(agent.id) ?? 0}</dd>
                </div>
              </dl>

              <div className="agent-list">
                <span className="wf-detail-h">Handling now</span>
                {now.length ? (
                  <ul>
                    {now.slice(0, 4).map((h) => (
                      <li key={`${h.caseId}-${h.block.id}`}>
                        <Link href={`/cases/${h.caseId}`}>
                          <strong>{h.block.name}</strong>
                          <em>{h.caseId}</em>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="is-muted">Nothing ready right now.</p>
                )}
              </div>

              <div className="agent-list">
                <span className="wf-detail-h">History</span>
                {past.length ? (
                  <ul>
                    {past.slice(-4).reverse().map((h) => (
                      <li key={`${h.caseId}-${h.block.id}`}>
                        <Link href={`/cases/${h.caseId}`}>
                          <strong>{h.block.name}</strong>
                          <em>
                            {h.caseId}
                            {h.hours != null ? ` · ${h.hours < 1 ? "<1h" : `${Math.round(h.hours)}h`}` : ""}
                          </em>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="is-muted">No completed blocks yet.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
