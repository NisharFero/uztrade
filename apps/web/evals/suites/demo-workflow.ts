/* Full demo walk-throughs for the procedures that have demo packs.
 *
 * This is the deterministic version of clicking through the dashboard step
 * assistant: open a workflow in memory, answer whatever the current step asks
 * for with its demo document/value/confirmation, let the orchestrator run, and
 * repeat until the workflow completes. */
import { existsSync } from "node:fs";
import { specFor, type DocType } from "../../modules/documents/specs";
import { DEMO_PROCEDURES, demoFor, demoForNeed, type DemoDocument } from "../../modules/demo/demo";
import { extractShipmentFacts, instantiateWorkflow } from "../../modules/workflow/domain";
import { createMemoryWorkflowRepository } from "../../modules/workflow/repository";
import { tailorProcedure } from "../../modules/workflow/tailor";
import { runOrchestrator } from "../../modules/workflow/orchestrator";
import { PROCEDURES } from "../../modules/procedures/sync";
import { assistantView } from "../../modules/steps/assistant";
import { recordDocument, recordInput, completeStep, StepNotReady } from "../../modules/steps/service";
import type { Need, StepView } from "../../modules/steps/next";
import type { DocumentRecord } from "../../modules/steps/ledger";
import type { ExtractedField } from "../../modules/documents/docai/compose";
import type { CaseResult, RunOptions, Suite } from "../types";

const CASE = (id: string) => `EVAL-DEMO-${id}`;
const RUN = (id: string) => `workflow:${CASE(id)}`;

function fieldsFor(doc: DemoDocument): ExtractedField[] {
  if (!doc.docType) return [];
  return specFor(doc.docType as DocType).fields.map((field) => {
    const value = doc.fields[field.key] ?? "";
    return {
      key: field.key,
      label: field.name,
      kind: field.kind,
      required: field.required,
      value: value || null,
      normalized: value || null,
      confidence: value ? 1 : 0,
      status: value ? "accepted" : field.required ? "missing" : "accepted",
      source: value ? "demo" : null,
      evidence: null,
      alternatives: [],
    };
  });
}

function recordFor(doc: DemoDocument, need: Need, stepNum: number): DocumentRecord {
  return {
    docId: `demo-${doc.id}-${stepNum}-${need.output ? "out" : "in"}`,
    version: Date.now(),
    label: need.label,
    docType: (doc.docType ?? need.docType) as DocType | null,
    stepNum,
    fileName: doc.file,
    contentType: "image/png",
    size: 1,
    r2Key: null,
    fields: fieldsFor(doc),
    checks: [],
    detectedType: (doc.docType ?? need.docType) as DocType | null,
    typeMatches: true,
    confirmed: true,
    parseError: null,
    reader: "demo",
    models: null,
    pages: 1,
    timingsMs: 0,
    parsedAt: new Date().toISOString(),
  };
}

function needsOf(step: StepView): Need[] {
  const chosen = step.variants.find((variant) => variant.chosen);
  return [...step.needs, ...(chosen?.needs ?? [])];
}

async function satisfyNeed(id: string, repository: ReturnType<typeof createMemoryWorkflowRepository>, step: StepView, need: Need): Promise<string | null> {
  if (need.optional || need.status === "have" || need.status === "waiting" || need.kind === "info" || need.kind === "earlier") return null;
  const runId = RUN(id);
  if (need.kind === "document") {
    const match = demoForNeed(id, need, step.stepNum);
    if (!match || match.kind !== "document") return `step ${step.stepNum}: no demo document for ${need.label}`;
    const path = match.url.replace(/^\/demo\//, "public/demo/");
    if (!existsSync(path)) return `step ${step.stepNum}: missing file ${path}`;
    await recordDocument(repository, runId, recordFor(match.document, need, step.stepNum));
    return null;
  }
  if (need.kind === "value") {
    const match = demoForNeed(id, need, step.stepNum);
    await recordInput(repository, runId, { kind: "value", stepNum: 0, label: need.label, value: match?.kind === "value" ? match.value : "Demo value" });
    return null;
  }
  if (need.kind === "confirm") {
    await recordInput(repository, runId, { kind: "confirm", stepNum: step.stepNum, label: need.label, value: "yes" });
    return null;
  }
  if (need.kind === "form" && need.form) {
    for (const group of need.form.groups) {
      for (const field of group.fields) {
        if (!field.missing) continue;
        await recordInput(repository, runId, { kind: "value", stepNum: 0, label: field.storageLabel, value: field.options[0] ?? "Demo value" });
      }
    }
    return null;
  }
  return `step ${step.stepNum}: cannot satisfy ${need.kind} need ${need.label}`;
}

async function walkDemo(id: string): Promise<string | null> {
  const scenario = demoFor(id);
  const published = PROCEDURES[id];
  if (!scenario || !published) return `${id}: demo pack or procedure is missing`;

  const facts = extractShipmentFacts(String(scenario.shipment.query));
  const procedure = tailorProcedure(published, facts, String(scenario.shipment.query));
  const runId = RUN(id);
  const repository = createMemoryWorkflowRepository();
  await repository.createRun({ id: runId, caseId: CASE(id), procedureVersionId: `procedure:${id}:v1`, status: "running", cycle: 0 }, instantiateWorkflow(procedure, runId), facts);
  await runOrchestrator(repository, runId);

  for (let guard = 0; guard < 400; guard += 1) {
    const projection = await repository.getProjection(runId);
    if (projection.run.status === "completed") return null;
    const view = assistantView(procedure, projection, CASE(id));
    const step = view.next;
    if (!step) return `${id}: no visible next step but run is ${projection.run.status}`;

    const unchosen = step.variants.length && !step.variants.some((variant) => variant.chosen);
    if (unchosen) {
      await recordInput(repository, runId, { kind: "variant", stepNum: step.stepNum, label: "Variant", value: step.variants[0].label });
      continue;
    }

    let changed = false;
    for (const need of needsOf(step)) {
      const before = need.status;
      const failed = await satisfyNeed(id, repository, step, need);
      if (failed) return failed;
      if (before !== "have" && before !== "waiting" && !need.optional && need.kind !== "info" && need.kind !== "earlier") changed = true;
    }
    const after = assistantView(procedure, await repository.getProjection(runId), CASE(id)).next;
    if (after?.stepNum === step.stepNum && after.ready) {
      try {
        await completeStep(repository, procedure, runId, step.stepNum);
      } catch (error) {
        if (error instanceof StepNotReady) return `step ${step.stepNum}: still needs ${error.missing.join(", ")}`;
        return `step ${step.stepNum}: ${error instanceof Error ? error.message : String(error)}`;
      }
      continue;
    }
    if (!changed) return `step ${step.stepNum}: no action changed the visible step; blocking ${step.blocking.join(", ")}`;
  }
  return `${id}: did not finish within the guard limit`;
}

export const demoWorkflowSuite: Suite = {
  name: "demo-workflow",
  about: "Walks all demo-backed procedures through the step assistant and workflow engine with demo documents, values and confirmations.",
  async run(options: RunOptions): Promise<CaseResult[]> {
    const ids = DEMO_PROCEDURES.slice(0, options.limit ?? DEMO_PROCEDURES.length);
    const results: CaseResult[] = [];
    for (const id of ids) {
      try {
        const failure = await walkDemo(id);
        results.push({ id, ok: !failure, detail: failure ?? (options.verbose ? "completed" : undefined) });
      } catch (error) {
        results.push({ id, ok: false, detail: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  },
};
