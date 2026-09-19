import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { PROCEDURES } from "../../../modules/procedures/sync";
import { delegationOfStep } from "../../../modules/procedures/delegation";
import { createPortalClient, type PortalClient } from "../../../modules/portals/client";
import { latestRecords, portalRecords } from "../../../modules/portals/records";
import { portalTargetOf } from "../../../modules/portals/targets";
import { assistantView } from "../../../modules/steps/assistant";
import { buildLedger } from "../../../modules/steps/ledger";
import { stepViewFor } from "../../../modules/steps/next";
import { recordInput, syncCase } from "../../../modules/steps/service";
import { extractShipmentFacts, instantiateWorkflow } from "../../../modules/workflow/domain";
import { runOrchestrator } from "../../../modules/workflow/orchestrator";
import { createMemoryWorkflowRepository, type WorkflowProjection, type WorkflowRepository } from "../../../modules/workflow/repository";
import { completeWorkflowWorkItem } from "../../../modules/workflow/service";
import { tailorProcedure } from "../../../modules/workflow/tailor";

type Handle = (request: Request) => Promise<Response>;

/** The entity APIs in-process - the same app apps/portals serves on :8790 - with a clock the test moves. */
async function entityApis(reviewMs = 0) {
  const { createPortalApp } = (await import(pathToFileURL(path.resolve(process.cwd(), "../portals/src/app.ts")).href)) as {
    createPortalApp: (options: { reviewMs: number; now: () => Date }) => Handle;
  };
  let clock = Date.parse("2026-09-15T08:00:00Z");
  const handle = createPortalApp({ reviewMs, now: () => new Date(clock) });
  const portals = createPortalClient({
    baseUrl: "http://entities.test",
    fetch: ((input: RequestInfo | URL, init?: RequestInit) => handle(new Request(input, init))) as typeof fetch,
  });
  return { portals, handle, tick: (ms: number) => void (clock += ms) };
}

const node = (projection: WorkflowProjection, stepNum: number) => projection.nodes.find((n) => n.stepNum === stepNum)!;

/** Case 868 - tea by train to Urumqi - with step 2 done, so the railway steps come up. */
async function openTeaCase(portals: PortalClient, query = "export 20 tonnes of tea from Tashkent to Urumqi by train", before?: (repository: WorkflowRepository, runId: string) => Promise<void>) {
  const repository = createMemoryWorkflowRepository();
  const runId = "workflow:UZ-T";
  const facts = extractShipmentFacts(query);
  const procedure = tailorProcedure(PROCEDURES["868"], facts, query);
  await repository.createRun({ id: runId, caseId: "UZ-T", procedureVersionId: "procedure:868:v1", status: "running", cycle: 0 }, instantiateWorkflow(procedure, runId), facts);
  await runOrchestrator(repository, runId, { portals });
  if (before) await before(repository, runId);
  const opened = await repository.getProjection(runId);
  const step2 = opened.workItems.find((w) => w.nodeId === node(opened, 2).id && w.state === "open")!;
  const projection = await completeWorkflowWorkItem(repository, step2.id, { verified: true }, "usr-trader", { portals });
  return { repository, runId, procedure, projection };
}

test("the agent files a railway step with its entity API: refused fields pause it, the trader's answers resume it, approval completes it", async () => {
  const { portals } = await entityApis();
  const { repository, runId, procedure, projection: afterStep2 } = await openTeaCase(portals);

  assert.equal(node(afterStep2, 3).state, "needs_input", "the railway refused an application without the applicant");
  let record = latestRecords(afterStep2).get(3)!;
  assert.equal(record.entity, "railway");
  assert.equal(record.status, "rejected");
  assert.deepEqual(record.flags.map((f) => [f.field, f.kind]), [["applicant.inn", "missing"], ["applicant.name", "missing"]]);
  assert.equal(record.submitted["shipment.destination_station"], "Urumqi", "what the case already knows is filled in");
  assert.equal(record.submitted["goods.hs_code"], "0902");

  const view = stepViewFor(procedure, afterStep2, buildLedger(afterStep2.artifacts), node(afterStep2, 3));
  assert.deepEqual(
    view.needs.filter((n) => n.id.startsWith("3:portal:")).map((n) => [n.label, n.status]),
    [["Applicant INN", "missing"], ["Applicant name", "missing"]],
  );
  assert.equal(view.portal?.status, "rejected");
  assert.equal(view.ready, false);

  await recordInput(repository, runId, { kind: "value", stepNum: 3, label: "Applicant INN", value: "12345" }, { portals });
  let projection = await recordInput(repository, runId, { kind: "value", stepNum: 3, label: "Applicant name", value: "Silk Road Tea LLC" }, { portals });
  record = latestRecords(projection).get(3)!;
  assert.equal(record.status, "rejected", "filed again as soon as both were given - and refused: the INN is malformed");
  assert.deepEqual(record.flags.map((f) => [f.field, f.kind]), [["applicant.inn", "invalid"]]);
  assert.match(record.flags[0].reason, /9 digits/);
  assert.equal(node(projection, 3).state, "needs_input");

  projection = await recordInput(repository, runId, { kind: "value", stepNum: 3, label: "Applicant INN", value: "301234567" }, { portals });
  record = latestRecords(projection).get(3)!;
  assert.equal(node(projection, 3).state, "completed");
  assert.equal(record.status, "approved");
  assert.equal(record.reference, "RW-2026-000001");
  assert.ok(Number(record.outputs.amount_usd) > 0);
  assert.deepEqual(portalRecords(projection).filter((r) => r.stepNum === 3).map((r) => r.status), ["rejected", "rejected", "approved"]);
  assert.ok(projection.artifacts.some((a) => a.type === "execution_receipt" && a.data.reference === "RW-2026-000001"));

  const assistant = assistantView(procedure, projection, "UZ-T");
  assert.equal(assistant.portals.find((p) => p.stepNum === 3)?.status, "approved");
  assert.ok(assistant.recent.some((item) => /Uzbekistan Railways Single Window approved RW-2026-000001/.test(item.text)));
});

test("an application under review keeps its step running; changes the entity requests are amended and reviewed again", async () => {
  const { portals, tick } = await entityApis(60_000);
  const { repository, runId, procedure, projection: opened } = await openTeaCase(portals, "export 140 tonnes of tea from Tashkent to Urumqi by train", async (repository, runId) => {
    await recordInput(repository, runId, { kind: "value", stepNum: 0, label: "Tax Identification Number of the organization or individual", value: "301234567" });
    await recordInput(repository, runId, { kind: "value", stepNum: 0, label: "Name of the organization", value: "Silk Road Tea LLC" });
    await recordInput(repository, runId, { kind: "value", stepNum: 0, label: "Quantity of transport units", value: "1" });
  });

  assert.equal(node(opened, 3).state, "running", "accepted, and the entity is reviewing it");
  assert.equal(latestRecords(opened).get(3)?.status, "under_review");
  const filed = portalRecords(opened).length;

  let projection = await syncCase(repository, runId, { portals });
  assert.equal(portalRecords(projection).length, filed, "nothing new is recorded while the review is still going");
  assert.equal(node(projection, 3).state, "running");

  tick(60_000);
  projection = await syncCase(repository, runId, { portals });
  assert.equal(latestRecords(projection).get(3)?.status, "changes_requested");
  assert.equal(node(projection, 3).state, "needs_input");
  const need = stepViewFor(procedure, projection, buildLedger(projection.artifacts), node(projection, 3)).needs.find((n) => n.id === "3:portal:shipment.wagons")!;
  assert.equal(need.label, "Number of wagons");
  assert.equal(need.status, "missing", "the case still says 1 wagon - the value the entity sent back");
  assert.match(need.detail, /at least 3 wagons/);
  assert.ok(need.suggestions?.some((s) => s.value === "3" && /Railways/.test(s.source)), "the number the entity named is offered as a fix");

  projection = await recordInput(repository, runId, { kind: "value", stepNum: 3, label: "Number of wagons", value: "3" }, { portals });
  let record = latestRecords(projection).get(3)!;
  assert.equal(record.status, "under_review", "amended, not filed anew");
  assert.equal(record.revision, 2);
  assert.equal(record.submitted["shipment.wagons"], "3");
  assert.equal(node(projection, 3).state, "running");

  tick(60_000);
  projection = await syncCase(repository, runId, { portals });
  record = latestRecords(projection).get(3)!;
  assert.equal(record.status, "approved");
  assert.equal(record.reference, "RW-2026-000001");
  assert.equal(node(projection, 3).state, "completed");
});

test("an unreachable entity API falls back to simulating the step", async () => {
  const down = createPortalClient({ baseUrl: "http://entities.test", fetch: (async () => { throw new TypeError("fetch failed"); }) as typeof fetch });
  const { projection } = await openTeaCase(down);
  assert.equal(node(projection, 3).state, "completed");
  assert.equal(latestRecords(projection).size, 0);
  assert.match(String(node(projection, 3).result?.portal), /unreachable/);
});

test("every online agent step of every procedure has a published entity API service; bank transfers go to the gateway", async () => {
  const { handle } = await entityApis();
  const published = (await (await handle(new Request("http://entities.test/entities"))).json()) as { entities: { id: string; services: { id: string }[] }[] };
  const services = new Set(published.entities.flatMap((e) => e.services.map((s) => `${e.id}/${s.id}`)));
  let mapped = 0;
  for (const procedure of Object.values(PROCEDURES)) {
    for (const step of procedure.blocks.flatMap((b) => b.steps)) {
      const target = portalTargetOf(step);
      if (/bank/i.test(step.entity) && /^online:\s*pay/i.test(step.channel)) {
        assert.equal(`${target?.entity}/${target?.service}`, "payments/transfer", `${procedure.id}#${step.num} is a bank transfer`);
      }
      if (delegationOfStep(step).lane !== "agent") continue;
      assert.ok(target, `${procedure.id}#${step.num} ${step.title} (${step.entity}) has an entity API`);
      assert.ok(services.has(`${target.entity}/${target.service}`), `${target.entity}/${target.service} is published`);
      mapped++;
    }
  }
  // 94 filings (306, 325 and 868: 9 each; 477: 13; 540: 7; 57: 16; 707: 18; 782: 11; 161: 2; 924: 0) and 56 bank transfers.
  assert.equal(mapped, 150);
  const cargo = PROCEDURES["477"].blocks.flatMap((b) => b.steps).find((s) => s.num === 20)!;
  assert.deepEqual(portalTargetOf(cargo)?.fixed, { regime: "IM70" });
});

test("the agent pays a bank transfer through the payment gateway once the trader authorises it", async () => {
  const { portals } = await entityApis();
  const { repository, runId, procedure, projection: opened } = await openTeaCase(portals, undefined, async (repository, runId) => {
    await recordInput(repository, runId, { kind: "value", stepNum: 0, label: "Tax Identification Number of the organization or individual", value: "301234567" });
    await recordInput(repository, runId, { kind: "value", stepNum: 0, label: "Name of the organization", value: "Silk Road Tea LLC" });
    await recordInput(repository, runId, { kind: "value", stepNum: 0, label: "Bank details", value: "Demo Bank JSCB, account 2020 8000 9001 2345 6001, MFO 00444" });
    // A stale amount typed for this payment - the gateway checks it against the cost calculation.
    await recordInput(repository, runId, { kind: "value", stepNum: 0, label: "Amount to pay, UZS · step 4", value: "1000" });
    await recordInput(repository, runId, { kind: "confirm", stepNum: 0, label: "Agreement with Technological center", value: "yes" });
  });

  const cost = latestRecords(opened).get(3)!;
  assert.equal(cost.status, "approved");
  assert.equal(node(opened, 4).lane, "agent");
  assert.equal(node(opened, 4).state, "needs_input", "no money moves before the trader authorises it");
  assert.equal(latestRecords(opened).get(4), undefined, "nothing was sent to the gateway");
  assert.deepEqual(stepViewFor(procedure, opened, buildLedger(opened.artifacts), node(opened, 4)).blocking, ["Payment authorisation"]);

  let projection = await recordInput(repository, runId, { kind: "confirm", stepNum: 4, label: "Payment authorisation", value: "yes" }, { portals });
  let record = latestRecords(projection).get(4)!;
  assert.equal(record.entity, "payments");
  assert.equal(record.status, "changes_requested");
  assert.equal(record.submitted["payer.account"], "20208000900123456001");
  assert.equal(record.submitted["payer.bank_mfo"], "00444");
  assert.equal(record.submitted["basis.document"], cost.reference);
  assert.match(record.submitted["payment.purpose"], /^UZ-T-P04 — /);
  assert.deepEqual(record.flags.map((f) => f.field), ["payment.amount"]);
  assert.match(record.flags[0].reason, new RegExp(`${cost.reference} asks for`));
  assert.ok(record.flags[0].suggestions?.some((s) => s.value === cost.outputs.amount_uzs), "the amount the railway calculated is offered");
  const need = stepViewFor(procedure, projection, buildLedger(projection.artifacts), node(projection, 4)).needs.find((n) => n.id === "4:portal:payment.amount")!;
  assert.equal(need.label, "Amount to pay, UZS · step 4", "kept per payment, so it can't leak into the next one");
  assert.equal(need.status, "missing");

  projection = await recordInput(repository, runId, { kind: "value", stepNum: 4, label: need.label, value: cost.outputs.amount_uzs }, { portals });
  assert.equal(latestRecords(projection).get(4)!.status, "under_review", "amended and resubmitted");
  projection = await syncCase(repository, runId, { portals });
  record = latestRecords(projection).get(4)!;
  assert.equal(record.status, "approved");
  assert.equal(record.revision, 2);
  assert.equal(record.outputs.status, "Paid");
  assert.equal(record.outputs.receipt_no, record.reference);
  assert.match(record.reference, /^PG-2026-\d{6}$/);
  assert.equal(node(projection, 4).state, "completed");
  assert.ok(projection.artifacts.some((a) => a.type === "execution_receipt" && a.data.reference === record.reference), "the receipt is in the case");
});
