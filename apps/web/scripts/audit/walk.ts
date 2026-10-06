/* Walks every published procedure from an opened case to its last step, the
 * way a diligent trader would, and reports every procedure that crashes or
 * gets stuck.
 *
 *   npx tsx scripts/audit/walk-procedures.ts [id ...] [--json out.json]
 *   (tests/unit/workflow/walk.test.ts walks a sample on every test run)
 *
 * For each step waiting on someone it gives exactly what the step view asks
 * for - picks a channel, confirms, types values, fills portal forms, uploads
 * documents (read and verified for the types Document Intelligence knows,
 * confirmed as provided for the rest) - and then completes the step. The run
 * is in memory with the entity portals simulated, so nothing touches the
 * database. A procedure passes when its run reaches "completed".
 */

import { CATALOGUE, PROCEDURES } from "../../modules/procedures/sync";
import { specFor, type DocType } from "../../modules/documents/specs";
import { buildLedger, type DocumentRecord } from "../../modules/steps/ledger";
import { stepViewFor, type Need } from "../../modules/steps/next";
import { completeStep, recordDocument, recordInput } from "../../modules/steps/service";
import { extractShipmentFacts, instantiateWorkflow } from "../../modules/workflow/domain";
import { runOrchestrator } from "../../modules/workflow/orchestrator";
import { createMemoryWorkflowRepository } from "../../modules/workflow/repository";
import { tailorProcedure } from "../../modules/workflow/tailor";

export type Outcome = { id: string; title: string; status: "completed" | "stuck" | "crashed"; steps: number; done: number; at?: number; reason?: string; ms: number };

const MAX_ACTIONS = 2000;

let seq = 0;
function verifiedDocument(docType: DocType, label: string, stepNum: number): DocumentRecord {
  seq += 1;
  return {
    docId: `walk-${seq}`,
    version: seq,
    label,
    docType,
    stepNum,
    fileName: `${docType}.pdf`,
    contentType: "application/pdf",
    size: 1024,
    r2Key: null,
    fields: specFor(docType).fields.map((f) => ({ key: f.key, label: f.name, kind: f.kind, required: f.required, value: "x", normalized: "x", confidence: 0.95, status: "accepted" as const, source: "walk", alternatives: [] })),
    checks: [],
    detectedType: docType,
    typeMatches: true,
    confirmed: false,
    parseError: null,
    pages: 1,
    timingsMs: null,
    parsedAt: new Date().toISOString(),
  };
}

/** Gives one need what it asks for. Returns false when nothing can be given. */
async function provide(repository: ReturnType<typeof createMemoryWorkflowRepository>, runId: string, stepNum: number, need: Need): Promise<boolean> {
  switch (need.kind) {
    case "document":
      if (need.docType) await recordDocument(repository, runId, verifiedDocument(need.docType, need.label, stepNum));
      else await recordInput(repository, runId, { kind: "confirm", stepNum, label: need.label, value: "yes" });
      return true;
    case "confirm":
      await recordInput(repository, runId, { kind: "confirm", stepNum, label: need.label, value: "yes" });
      return true;
    case "value":
      await recordInput(repository, runId, { kind: "value", stepNum, label: need.label, value: "100" });
      return true;
    case "form": {
      const missing = need.form?.groups.flatMap((g) => g.fields.filter((f) => f.missing)) ?? [];
      for (const field of missing) {
        await recordInput(repository, runId, { kind: "value", stepNum, label: field.storageLabel, value: field.options[0] ?? "100" });
      }
      return missing.length > 0;
    }
    default:
      return false;
  }
}

export async function walk(id: string): Promise<Outcome> {
  const began = Date.now();
  const summary = CATALOGUE[id];
  const published = PROCEDURES[id];
  const base = { id, title: summary.title, steps: summary.stepsCount, ms: 0 };
  const repository = createMemoryWorkflowRepository();
  const runId = `workflow:WALK-${id}`;
  let at: number | undefined;
  try {
    const verb = summary.direction === "import" ? "import" : "export";
    const facts = extractShipmentFacts(`${verb} 20 tonnes of ${summary.goods} from Tashkent to Almaty by ${summary.mode}`);
    const procedure = tailorProcedure(published, facts);
    await repository.createRun({ id: runId, caseId: `WALK-${id}`, procedureVersionId: `procedure:${id}:v1`, status: "running", cycle: 0 }, instantiateWorkflow(procedure, runId), facts);
    await runOrchestrator(repository, runId);

    for (let actions = 0; actions < MAX_ACTIONS; actions++) {
      const projection = await repository.getProjection(runId);
      const done = projection.nodes.filter((n) => n.state === "completed" || n.state === "skipped").length;
      if (projection.run.status === "completed") return { ...base, status: "completed", done, ms: Date.now() - began };

      const node = projection.nodes.filter((n) => n.state === "needs_input").sort((a, b) => a.stepNum - b.stepNum)[0];
      if (!node) {
        const states = Object.entries(
          projection.nodes.reduce<Record<string, number>>((acc, n) => ((acc[n.state] = (acc[n.state] ?? 0) + 1), acc), {}),
        ).map(([s, n]) => `${n} ${s}`);
        return { ...base, status: "stuck", done, reason: `Nothing waiting on anyone, run is ${projection.run.status}: ${states.join(", ")}`, ms: Date.now() - began };
      }
      at = node.stepNum;

      let view = stepViewFor(procedure, projection, buildLedger(projection.artifacts), node);
      if (view.variants.length && !view.variants.some((v) => v.chosen)) {
        await recordInput(repository, runId, { kind: "variant", stepNum: node.stepNum, label: "variant", value: view.variants[0].label });
        continue;
      }
      if (!view.ready) {
        const chosen = view.variants.find((v) => v.chosen);
        const open = [...view.needs, ...(chosen?.needs ?? [])].find((n) => !n.optional && n.status !== "have");
        if (!open || !(await provide(repository, runId, node.stepNum, open))) {
          return { ...base, status: "stuck", done, at, reason: `Cannot satisfy: ${view.blocking.join(" | ")}`, ms: Date.now() - began };
        }
        // Giving it must have changed something, or the walk would loop.
        const after = await repository.getProjection(runId);
        const again = after.nodes.find((n) => n.id === node.id)!;
        if (again.state === "needs_input") {
          view = stepViewFor(procedure, after, buildLedger(after.artifacts), again);
          const still = [...view.needs, ...(view.variants.find((v) => v.chosen)?.needs ?? [])].find((n) => n.id === open.id && n.status !== "have" && !n.optional);
          if (still && still.status === open.status && still.kind !== "form") {
            return { ...base, status: "stuck", done, at, reason: `Gave "${open.label}" (${open.kind}) but it is still ${still.status}: ${still.detail}`, ms: Date.now() - began };
          }
        }
        continue;
      }
      await completeStep(repository, procedure, runId, node.stepNum, "usr-walk");
    }
    return { ...base, status: "stuck", done: 0, at, reason: `No end after ${MAX_ACTIONS} actions`, ms: Date.now() - began };
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    const where = e.stack?.split("\n").find((l) => l.includes("modules"))?.trim() ?? "";
    return { ...base, status: "crashed", done: 0, at, reason: `${e.message} ${where}`, ms: Date.now() - began };
  }
}

