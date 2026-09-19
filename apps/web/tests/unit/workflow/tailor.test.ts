import assert from "node:assert/strict";
import test from "node:test";
import { PROCEDURES, type Procedure } from "../../../modules/procedures/sync";
import { delegationOfStep } from "../../../modules/procedures/delegation";
import { inputKey, type Ledger } from "../../../modules/steps/ledger";
import { stepViewFor } from "../../../modules/steps/next";
import { instantiateWorkflow, type ShipmentFacts } from "../../../modules/workflow/domain";
import type { WorkflowProjection } from "../../../modules/workflow/repository";
import { blockExtras, stepExtras, tailorProcedure } from "../../../modules/workflow/tailor";

const facts = (goods: string, quantity: number | null, unit: string | null, origin: string | null, destination: string | null, mode: string): ShipmentFacts => ({
  goods,
  quantity,
  unit,
  origin,
  destination,
  mode,
});
const stepsOf = (p: Procedure) => p.blocks.flatMap((b) => b.steps);
const stepOf = (p: Procedure, num: number) => stepsOf(p).find((s) => s.num === num)!;
const EMPTY: Ledger = { inputs: new Map(), documents: [] };

function viewOf(p: Procedure, f: ShipmentFacts, num: number, ledger: Ledger = EMPTY) {
  const runId = "workflow:tailor";
  const workflow = instantiateWorkflow(p, runId);
  const projection: WorkflowProjection = {
    run: { id: runId, caseId: "T-tailor", procedureVersionId: `procedure:${p.id}:v1`, status: "running", cycle: 0 },
    shipmentFacts: f,
    nodes: workflow.nodes,
    edges: workflow.edges,
    workItems: [],
    agentRuns: [],
    artifacts: [],
    auditEvents: [],
  };
  return stepViewFor(p, projection, ledger, workflow.nodes.find((n) => n.stepNum === num)!);
}

const TOMATOES = facts("tomatoes", 20, "tonnes", "Andijan", "Almaty", "train");

test("tomatoes to Kazakhstan: the fresh-produce procedure becomes this shipment's workflow, every step kept", () => {
  const published = PROCEDURES["325"];
  const p = tailorProcedure(published, TOMATOES);
  assert.equal(p.title, "Export of tomatoes by train");
  assert.equal(p.shipment.line, "20 t · 1 refrigerated wagon · Andijan → Almaty (to Kazakhstan) · HS 0702");
  assert.deepEqual(stepsOf(p).map((s) => s.num), stepsOf(published).map((s) => s.num));
  assert.deepEqual(stepsOf(p).map((s) => s.inputs), stepsOf(published).map((s) => s.inputs), "inputs keep their published labels");
  for (const s of stepsOf(p)) assert.equal(delegationOfStep(s).lane, delegationOfStep(stepOf(published, s.num)).lane, `lane of step ${s.num}`);
  assert.ok(stepsOf(p).some((s) => /wagon.* — 1 refrigerated wagon$/i.test(s.title)), "wagon steps name the load");
  assert.ok(p.changes.length > 0);
});

test("tomatoes to Kazakhstan: route, origin proof, destination requirements and perishability", () => {
  const p = tailorProcedure(PROCEDURES["325"], TOMATOES);
  const iranStep = stepsOf(p).find((s) => s.inputs.some((i) => /iran approval letter/i.test(i)))!;
  assert.match(stepExtras(iranStep).notNeeded[0].reason, /doesn't cross Iran/);

  const declaration = stepsOf(p).find((s) => /create export customs declaration/i.test(s.title))!;
  assert.deepEqual(stepExtras(declaration).notNeeded.map((n) => n.label).sort(), ["Certificate of origin General form", "Certificate of origin form A"].sort());
  assert.ok(p.blocks.some((b) => blockExtras(b).notes.some((n) => /Kazakhstan accepts Form CT-1/.test(n))));

  assert.ok(stepsOf(p).some((s) => stepExtras(s).extraNeeds.some((e) => /ISPM 15/.test(e.label))), "ISPM 15 is tracked on the step it gates");
  assert.ok(p.changes.some((c) => c.kind === "destination" && /Phytosanitary certificate for fresh produce/.test(c.reason)));
  assert.equal(stepExtras(stepsOf(p).find((s) => s.inputs.includes("Quantity of transport units"))!).prefill["Quantity of transport units"].value, "1");
  assert.ok(p.blocks.some((b) => blockExtras(b).notes.some((n) => /^Perishable tomatoes/.test(n))));
});

test("the step engine follows the shipment workflow: ruled-out inputs don't block, added requirements do", () => {
  const p = tailorProcedure(PROCEDURES["325"], TOMATOES);
  const iranStep = stepsOf(p).find((s) => s.inputs.some((i) => /iran approval letter/i.test(i)))!;
  const view = viewOf(p, TOMATOES, iranStep.num);
  const all = [...view.needs, ...view.variants.flatMap((v) => v.needs)];
  assert.ok(all.some((n) => /iran approval letter/i.test(n.label) && n.notApplicable && n.status === "have"));
  assert.ok(!view.blocking.some((b) => /iran/i.test(b)), view.blocking.join(" | "));

  const gate = stepsOf(p).find((s) => stepExtras(s).extraNeeds.some((e) => /ISPM 15/.test(e.label)))!;
  const label = stepExtras(gate).extraNeeds.find((e) => /ISPM 15/.test(e.label))!.label;
  assert.ok(viewOf(p, TOMATOES, gate.num).blocking.includes(label));
  const key = inputKey("confirm", gate.num, label);
  const confirmed: Ledger = { inputs: new Map([[key, { key, kind: "confirm" as const, label, stepNum: gate.num, value: "yes", version: 1 }]]), documents: [] };
  assert.ok(!viewOf(p, TOMATOES, gate.num, confirmed).blocking.includes(label));

  const unitsStep = stepsOf(p).find((s) => s.inputs.includes("Quantity of transport units"))!;
  const need = viewOf(p, TOMATOES, unitsStep.num).needs.find((n) => n.label === "Quantity of transport units")!;
  assert.deepEqual([need.status, need.value], ["have", "1"]);
});

test("tea to Russia: two wagons re-time the loading, the Iran letter drops out, nothing for fresh produce", () => {
  const f = facts("tea", 60, "tonnes", "Tashkent", "Moscow", "train");
  const p = tailorProcedure(PROCEDURES["868"], f);
  assert.equal(p.title, "Export of tea by train");
  assert.match(p.shipment.line, /^60 t · 2 covered wagons · Tashkent → Moscow \(to Russia\)/);
  const loading = p.blocks.find((b) => /loading/i.test(b.publishedName))!;
  assert.notDeepEqual(loading.estDuration, blockExtras(loading).publishedDuration);
  assert.ok(!p.changes.some((c) => /fresh produce/i.test(c.reason)));
  const s20 = stepExtras(stepOf(p, 20));
  assert.ok(s20.notNeeded.some((n) => /iran/i.test(n.label)));
  assert.match(s20.notNeeded[0].reason, /via Kazakhstan/);
});

test("tea to China: GACC registration gates the declaration, and Form A keeps its form", () => {
  const p = tailorProcedure(PROCEDURES["868"], facts("tea", 20, "tonnes", "Tashkent", "Urumqi", "train"));
  const declaration = stepExtras(stepOf(p, 41));
  assert.ok(declaration.extraNeeds.some((e) => /GACC/.test(e.label)));
  assert.deepEqual(declaration.notNeeded.map((n) => n.label), ["Certificate of origin General form"]);
  assert.ok(stepExtras(stepOf(p, 20)).notNeeded.some((n) => /iran/i.test(n.label)));
});

test("tea import from China: the exporter's country is named and no export-side requirements are added", () => {
  const p = tailorProcedure(PROCEDURES["477"], facts("tea", 20, "tonnes", "Urumqi", "Bukhara", "train"));
  assert.equal(p.title, "Import of tea by train");
  assert.ok(stepsOf(p).every((s) => stepExtras(s).extraNeeds.length === 0));
  assert.ok(stepsOf(p).some((s) => stepExtras(s).notes.some((n) => /Exporter's country: China/.test(n))));
  assert.equal(stepExtras(stepOf(p, 1)).prefill["Amount of consignment"].value, "20 t");
});

test("without a route or quantity nothing is guessed, and tailoring is idempotent", () => {
  const p = tailorProcedure(PROCEDURES["868"], facts("tea", null, null, null, null, "train"));
  assert.equal(p.shipment.line, "HS 0902");
  assert.ok(stepsOf(p).every((s) => !stepExtras(s).notNeeded.length && !stepExtras(s).extraNeeds.length && !Object.keys(stepExtras(s).prefill).length));
  assert.equal(tailorProcedure(p, TOMATOES), p);
});
