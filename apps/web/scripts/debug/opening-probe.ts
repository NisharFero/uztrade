/* One-off: the message the trader sees the moment a case is opened. */
import { briefOpening } from "../../modules/steps/briefing";
import { AGENT_STEP_MINUTES } from "../../modules/steps/kpis";
import { CATALOGUE } from "../../modules/procedures/data/procedures.generated";
import type { AssistantView } from "../../modules/steps/assistant";

const BASE = "http://localhost:3000";
const message = process.argv.slice(2).join(" ") || "export 20 tonnes of tea from Tashkent to Almaty by train";

const chat = async (payload: Record<string, unknown>) => {
  const response = await fetch(`${BASE}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  let turn: { draft: unknown; summary?: Record<string, string> } | null = null;
  for (const line of (await response.text()).split("\n")) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.type === "result" && event.result.kind === "intake") turn = event.result.turn;
  }
  return turn;
};

const turn = await chat({ message });
if (!turn?.summary) throw new Error("intake did not reach a confirmable shipment");
const s = turn.summary as Record<string, string>;

const opened = await (
  await fetch(`${BASE}/api/intake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft: turn.draft, confirm: true }) })
).json();

const view = (await (await fetch(`${BASE}/api/cases/${opened.caseId}/assistant`)).json()) as AssistantView;
const published = CATALOGUE[opened.procedureId]?.timeframe ?? view.kpis.etaHours;
const shipment = s.query.replace(/^(export|import)\s+/i, "");

const opening = briefOpening({ view, shipment, direction: s.direction, published, agentMinutesEach: AGENT_STEP_MINUTES });

console.log(`\n(case ${opened.caseId})\n`);
for (const p of opening.paragraphs) console.log(`${p}\n`);
if (opening.comparison) {
  console.log(`  │ ${opening.comparison.published}`);
  console.log(`  │ ${opening.comparison.withAgents}`);
  console.log(`  │ ${opening.comparison.saved}`);
}
