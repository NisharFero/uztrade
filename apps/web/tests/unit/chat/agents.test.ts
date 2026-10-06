/* The agent rail's contract: every state is read from the case, and only
 * something the trader has to answer shows as "needs you". */
import assert from "node:assert/strict";
import test from "node:test";
import { agentStatuses, riskSummary, type StatusInput } from "../../../modules/chat/agents";
import type { IntakeTurn } from "../../../modules/intake/conversation";
import type { RiskReport } from "../../../modules/compliance/risk";
import type { AssistantView } from "../../../modules/steps/assistant";

const none: StatusInput = { thinking: null, turn: null, caseId: null, view: null, busy: null, risk: null, transit: null };
const byId = (input: StatusInput) => Object.fromEntries(agentStatuses(input).map((s) => [s.id, s]));

test("before anything is said, every agent is idle", () => {
  const all = agentStatuses(none);
  assert.deepEqual(all.map((s) => s.id), ["assistant", "orchestrator", "documents", "risk", "transit"]);
  assert.ok(all.every((s) => s.state === "idle"));
});

test("the assistant works while it reads, then waits on the one detail it asked for", () => {
  assert.equal(byId({ ...none, thinking: "assistant" }).assistant.state, "working");

  const turn = {
    status: "asking",
    slot: "quantity",
    message: "How much tea?",
    options: [],
    notes: [],
    draft: {},
    progress: [
      { slot: "commodity", label: "What", value: "Tea", done: true },
      { slot: "quantity", label: "How much", value: null, done: false },
      { slot: "route", label: "From → To", value: null, done: false },
    ],
  } as unknown as IntakeTurn;
  const s = byId({ ...none, turn }).assistant;
  assert.equal(s.state, "needs-you");
  assert.match(s.now, /how much/);
  assert.ok(s.details.some((d) => /one at a time/.test(d)));
});

test("with a case open, the orchestrator waits on what the step is blocked by", () => {
  const view = {
    caseId: "UZ-2609-0001",
    procedureId: "868",
    title: "Export of tea by train",
    status: "active",
    kpis: { completed: 0, total: 48, agentDone: 0, agentTotal: 15 },
    next: { stepNum: 1, title: "Register contract", lane: "user", paused: false, ready: false, blocking: ["Electronic digital signature"], needs: [], entity: "" },
    parallel: [],
    documents: [],
    recent: [],
  } as unknown as AssistantView;
  const s = byId({ ...none, caseId: view.caseId, view });
  assert.equal(s.assistant.state, "idle", "intake handed the case over");
  assert.equal(s.orchestrator.state, "needs-you");
  assert.match(s.orchestrator.now, /electronic digital signature/);
  assert.equal(byId({ ...none, caseId: view.caseId, view, busy: "complete" }).orchestrator.state, "working");
  assert.equal(s.risk.state, "working", "no report yet: the rules are still running");
});

test("risk needs you only for a flagged rule, and says which", () => {
  const report = {
    overall: { key: "overall", title: "Overall risk", value: "", status: "caution", reason: "HS classification" },
    rows: [
      { key: "hs", title: "HS classification", value: "0902", status: "caution", reason: "box 33 needs 10 digits" },
      { key: "cert", title: "Certificate of origin", value: "Pending", status: "pending", reason: "" },
    ],
  } as RiskReport;
  const s = byId({ ...none, caseId: "UZ-2609-0001", risk: report }).risk;
  assert.equal(s.state, "needs-you");
  assert.equal(riskSummary(report), "One thing to check before customs: HS classification.");
  assert.ok(s.details.includes("HS classification: box 33 needs 10 digits"));

  const clear = { ...report, rows: [report.rows[1]] };
  assert.equal(byId({ ...none, caseId: "UZ-2609-0001", risk: clear }).risk.state, "idle");
});
