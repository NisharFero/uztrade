/* The block dashboard's contract with the backend.
 *
 *   intake block    fields -> previewIntake: a matched procedure, its timing and
 *                   needs, or what is still missing - and never a case
 *   step block      the step comes from the orchestrator's view; completing is
 *                   refused until its needs are in, and the next step is the
 *                   orchestrator's, not the page's
 */
import assert from "node:assert/strict";
import test from "node:test";
import { previewIntake, shipmentSentence } from "../../../modules/intake/preview";
import { CATALOGUE } from "../../../modules/procedures/data/procedures.generated";
import { runOrchestrator } from "../../../modules/workflow/orchestrator";
import { PROCEDURES } from "../../../modules/procedures/sync";
import { extractShipmentFacts, instantiateWorkflow } from "../../../modules/workflow/domain";
import { specFor } from "../../../modules/documents/specs";
import { assistantView } from "../../../modules/steps/assistant";
import type { DocumentRecord } from "../../../modules/steps/ledger";
import { completeStep, recordDocument, recordInput, StepNotReady } from "../../../modules/steps/service";
import { createMemoryWorkflowRepository } from "../../../modules/workflow/repository";

/* ---------------------------------------------------------- intake block --- */

test("the fields become one sentence the rules read best", () => {
  assert.equal(
    shipmentSentence({ direction: "export", goods: "tea", quantity: "20", unit: "tonnes", origin: "Tashkent", destination: "Almaty", mode: "train" }),
    "export 20 tonnes of tea from Tashkent to Almaty by train",
  );
  assert.equal(shipmentSentence({ goods: "cement", mode: "road" }), "cement by road");
});

test("complete fields are matched to a procedure, timed and listed - and nothing is opened", async () => {
  const preview = await previewIntake({ message: shipmentSentence({ direction: "export", goods: "tea", quantity: "20", unit: "tonnes", origin: "Tashkent", destination: "Almaty", mode: "train" }) });
  assert.equal(preview.turn.status, "confirm");
  assert.equal(preview.procedure?.id, "868");
  assert.equal(preview.procedure?.title, "Export of tea by train");
  assert.equal(preview.procedure?.stages, 10);
  assert.ok(preview.timing?.doorToDoor, "both ends known, so door to door");
  assert.ok((preview.timing?.paperwork[1] ?? Infinity) <= preview.procedure!.published[1]);
  assert.ok((preview.needs?.documents.length ?? 0) > 0);
  assert.equal("caseId" in preview, false, "a preview never carries a case");
});

test("missing fields are named, and the published ways are still shown", async () => {
  const preview = await previewIntake({ message: "tea" });
  assert.equal(preview.turn.status, "asking");
  assert.equal(preview.procedure, null);
  assert.ok(preview.turn.progress.some((p) => !p.done));
  assert.ok((preview.estimate?.options.length ?? 0) >= 5, "every published way to move tea");
});

test("a choice intake needs is offered, and choosing it completes the match", async () => {
  const first = await previewIntake({ message: "import 12 tonnes of yoghurt from Almaty to Tashkent by road" });
  assert.equal(first.turn.slot, "regime");
  const clearance = first.turn.options.find((o) => /clearance only/i.test(o.label));
  assert.ok(clearance, "clearance is one of the choices");
  const chosen = await previewIntake({ message: clearance!.reply, draft: first.turn.draft, expecting: "regime" });
  assert.equal(chosen.turn.status, "confirm");
  // Clearance procedures share their title with the full import; the regime tells them apart.
  assert.equal(CATALOGUE[chosen.procedure!.id].regime, "clearance");
});

test("a typed line is corrected before it is read", async () => {
  const preview = await previewIntake({ message: "export 20 tonnes of taea from tashkent to almaty by tarain" });
  assert.deepEqual(preview.fixes.map((f) => f.to), ["tea", "train"]);
  assert.equal(preview.procedure?.id, "868");
});

/* ------------------------------------------------------------ step block --- */

const confirmedContract = (): DocumentRecord => ({
  docId: "doc-contract-1",
  version: 1,
  label: "Electronic copy of foreign trade contract",
  docType: "trade_contract",
  stepNum: 1,
  fileName: "contract.pdf",
  contentType: "application/pdf",
  size: 1024,
  r2Key: null,
  fields: specFor("trade_contract")
    .fields.filter((f) => f.questions.length || f.anchors.length)
    .map((f) => ({ key: f.key, label: f.name, kind: f.kind, required: f.required, value: "x", normalized: "x", confidence: 1, status: "confirmed" as const, source: "trader", alternatives: [] })),
  checks: [],
  detectedType: "trade_contract",
  typeMatches: true,
  confirmed: true,
  parseError: null,
  pages: 1,
  timingsMs: null,
  parsedAt: "2026-09-22T00:00:00.000Z",
});

test("the step block's loop: the orchestrator's step, refused until ready, then the next step from the orchestrator", async () => {
  // What "Start case" opens for the matched procedure.
  const preview = await previewIntake({ message: "export 20 tonnes of tea from Tashkent to Almaty by train" });
  const procedure = PROCEDURES[preview.procedure!.id];
  const repository = createMemoryWorkflowRepository();
  const runId = "workflow:T-BLOCKS";
  await repository.createRun(
    { id: runId, caseId: "T-BLOCKS", procedureVersionId: `procedure:${procedure.id}:v1`, status: "running", cycle: 0 },
    instantiateWorkflow(procedure, runId),
    extractShipmentFacts("export 20 tonnes of tea from Tashkent to Almaty by train"),
  );
  await runOrchestrator(repository, runId);

  let view = assistantView(procedure, await repository.getProjection(runId), "T-BLOCKS");
  assert.equal(view.next?.stepNum, 1, "the block shows the orchestrator's first step");
  assert.equal(view.next?.ready, false);
  assert.ok(view.next!.blocking.length > 0, "and says what is still needed");

  // "Complete step" before the needs are in is refused, not skipped.
  await assert.rejects(() => completeStep(repository, procedure, runId, 1), StepNotReady);

  // What the block sends: a confirmation and a confirmed document.
  await recordInput(repository, runId, { kind: "confirm", stepNum: 1, label: "Electronic digital signature", value: "yes" });
  await recordDocument(repository, runId, confirmedContract());
  view = assistantView(procedure, await repository.getProjection(runId), "T-BLOCKS");
  assert.equal(view.next?.stepNum, 1);
  assert.equal(view.next?.ready, true, "ready once its needs are in");

  await completeStep(repository, procedure, runId, 1);
  view = assistantView(procedure, await repository.getProjection(runId), "T-BLOCKS");
  assert.equal(view.kpis.completed, 1);
  assert.notEqual(view.next?.stepNum, 1, "the next step comes from the orchestrator");
  assert.ok(view.completed.some((c) => c.stepNum === 1));
});
