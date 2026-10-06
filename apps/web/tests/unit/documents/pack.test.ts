import assert from "node:assert/strict";
import test from "node:test";
import { createLlmClient } from "../../../modules/ai/llm";
import { classifyPage, labelForType, typeOfFile } from "../../../modules/documents/pack";
import { ingestDocument } from "../../../modules/documents/ingest";
import { PROCEDURES } from "../../../modules/procedures/sync";
import { extractShipmentFacts, instantiateWorkflow } from "../../../modules/workflow/domain";
import { runOrchestrator } from "../../../modules/workflow/orchestrator";
import { createMemoryWorkflowRepository } from "../../../modules/workflow/repository";
import { tailorProcedure } from "../../../modules/workflow/tailor";

const INVOICE_PAGE = "СЧЕТ / INVOICE № INV-2026/017\nМесто и дата / Place and date: Tashkent, 12.09.2026\nОписание товара / Description of goods: black tea";

const local = (answer: object) =>
  createLlmClient({
    localUrl: "http://127.0.0.1:11434/v1",
    fetch: (async () => new Response(JSON.stringify({ model: "qwen", choices: [{ message: { content: JSON.stringify(answer) } }] }))) as unknown as typeof fetch,
  });

test("a file is typed by its name, then by the printed title, then by a local model", async () => {
  assert.deepEqual(await typeOfFile({ fileName: "commercial-invoice-17.pdf" }), { docType: "commercial_invoice", from: "name" });
  assert.deepEqual(await typeOfFile({ fileName: "scan_0007.jpg", text: INVOICE_PAGE }), { docType: "commercial_invoice", from: "page" });

  const unreadable = "0007 ... ... 12.09.2026 ... 20 000";
  assert.deepEqual(await typeOfFile({ fileName: "scan_0008.jpg", text: unreadable }), { docType: null, from: null }, "no name, no title, no local model: not placed");
  assert.deepEqual(await typeOfFile({ fileName: "scan_0008.jpg", text: unreadable, llm: local({ docType: "packing_list" }) }), { docType: "packing_list", from: "model" });
});

test("an upload is removed when its ledger write fails", async () => {
  const repository = createMemoryWorkflowRepository();
  const runId = "workflow:failed-upload";
  const procedure = PROCEDURES["868"];
  const facts = extractShipmentFacts("export tea from Tashkent to Almaty by train");
  await repository.createRun(
    { id: runId, caseId: "failed-upload", procedureVersionId: "procedure:868:v1", status: "running", cycle: 0 },
    instantiateWorkflow(procedure, runId), facts,
  );
  const actions: string[] = [];
  await assert.rejects(() => ingestDocument({
    repository: { ...repository, addArtifact: async () => { throw new Error("ledger unavailable"); } },
    runId, caseId: "failed-upload", procedure, query: "export tea", facts,
    bytes: new ArrayBuffer(1), fileName: "unknown.bin", contentType: "application/octet-stream",
    label: "Unclassified file", stepNum: 1, docType: null,
    bucket: {
      async put(key) { actions.push(`put:${key}`); },
      async delete(key) { actions.push(`delete:${key}`); },
    },
  }), /ledger unavailable/);
  assert.equal(actions.length, 2);
  assert.equal(actions[1], actions[0].replace("put:", "delete:"));
});

test("a model naming something that isn't a known document places nothing", async () => {
  assert.equal(await classifyPage("some page", local({ docType: "shipping_manifest" })), null);
  assert.equal(await classifyPage("some page", createLlmClient({ groqApiKey: "k", fetch: (async () => assert.fail("page text must not go to Groq")) as unknown as typeof fetch })), null);
});

test("the type picks the need it answers: the earliest open step that asks for it", async () => {
  const repository = createMemoryWorkflowRepository();
  const runId = "workflow:P";
  const query = "export 20 tonnes of tea from Tashkent to Urumqi by train";
  const facts = extractShipmentFacts(query);
  const procedure = tailorProcedure(PROCEDURES["868"], facts, query);
  await repository.createRun({ id: runId, caseId: "P", procedureVersionId: "procedure:868:v1", status: "running", cycle: 0 }, instantiateWorkflow(procedure, runId), facts);
  await runOrchestrator(repository, runId);
  const projection = await repository.getProjection(runId);

  const invoice = labelForType(procedure, projection, "commercial_invoice")!;
  assert.match(invoice.label, /invoice/i);
  assert.ok(invoice.stepNum > 0);
  assert.ok(
    procedure.blocks.flatMap((b) => b.steps).find((s) => s.num === invoice.stepNum)!.inputs.includes(invoice.label),
    "the label is the step's own wording, so it satisfies that need",
  );
});
