/* Taking one uploaded file into the case: keep the original, read it with the
 * document AI, give uncertain fields a second (local-model) reading, check it
 * against what the case already holds, and record it in the ledger.
 *
 * Both upload paths use this - one file for a step's need, or a pack of files
 * dropped in at once (pack.ts) - so a document arrives the same way whichever
 * door it came through. */

import type { LlmClient } from "../ai/llm";
import type { Procedure } from "../procedures/data/procedures.generated";
import { checkContext } from "../steps/context";
import { buildLedger, nextVersion, type DocumentRecord } from "../steps/ledger";
import { recordDocument } from "../steps/service";
import type { AgenticAiClient } from "../workflow/agentic-ai";
import type { PortalClient } from "../portals/client";
import type { ShipmentFacts } from "../workflow/domain";
import type { WorkflowProjection, WorkflowRepository } from "../workflow/repository";
import { DOCAI_URL_DEFAULT } from "./docai/client";
import { crossCheck } from "./docai/crosscheck";
import { adjudicateNames } from "./docai/names";
import { rereadUncertainFields } from "./docai/reread";
import { parseUploadedDocument } from "./docai/upload";
import { specFor, type DocType } from "./specs";

export type DocsBucket = {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
};

export type IngestInput = {
  repository: WorkflowRepository;
  runId: string;
  caseId: string;
  procedure: Procedure;
  query: string;
  facts: Partial<ShipmentFacts>;
  bytes: ArrayBuffer;
  fileName: string;
  contentType: string;
  /** The need this answers, as the case names it. */
  label: string;
  stepNum: number;
  docType: DocType | null;
  bucket?: DocsBucket | null;
  docaiUrl?: string;
  llm?: LlmClient;
  ai?: AgenticAiClient;
  portals?: PortalClient;
};

export type Ingested = { record: DocumentRecord; projection: WorkflowProjection; text: string };

export async function ingestDocument(input: IngestInput): Promise<Ingested> {
  const docId = `doc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  let r2Key: string | null = null;
  if (input.bucket) {
    r2Key = `cases/${input.caseId}/${docId}/${input.fileName.replace(/[^\w.-]+/g, "_")}`;
    await input.bucket.put(r2Key, input.bytes, { httpMetadata: { contentType: input.contentType } });
  }

  const projection = await input.repository.getProjection(input.runId);
  const ledger = buildLedger(projection.artifacts);

  let parsed = null as Awaited<ReturnType<typeof parseUploadedDocument>>["document"] | null;
  let parseError: string | null = null;
  let text = "";
  let reader: DocumentRecord["reader"];
  let models: DocumentRecord["models"] = null;
  if (input.docType) {
    const analyzed = await parseUploadedDocument({
      bytes: input.bytes,
      fileName: input.fileName,
      contentType: input.contentType,
      spec: specFor(input.docType),
      procedureId: input.procedure.id,
      baseUrl: input.docaiUrl || DOCAI_URL_DEFAULT,
    });
    reader = analyzed.fallback;
    models = analyzed.models;
    parsed = analyzed.document;
    parseError = analyzed.parseError;
    text = analyzed.text;
  }

  // Document data: both of these use a model only if one runs on this machine.
  const fields = parsed ? (await rereadUncertainFields(parsed.fields, text, input.llm)).fields : [];
  const checks = parsed && input.docType
    ? await adjudicateNames(crossCheck(input.docType, fields, checkContext(input.procedure, input.facts, input.query, ledger, input.stepNum)), input.llm)
    : [];

  const record: DocumentRecord = {
    docId,
    version: nextVersion(),
    label: input.label,
    docType: input.docType,
    stepNum: input.stepNum,
    fileName: input.fileName,
    contentType: input.contentType,
    size: input.bytes.byteLength,
    r2Key,
    fields,
    checks,
    detectedType: parsed?.detectedType ?? null,
    typeMatches: parsed?.typeMatches ?? true,
    confirmed: false,
    parseError,
    reader,
    models,
    pages: parsed?.pages ?? 0,
    timingsMs: parsed?.timings?.total_ms ?? null,
    parsedAt: new Date().toISOString(),
  };

  const after = await recordDocument(input.repository, input.runId, record, { ai: input.ai, portals: input.portals });
  return { record, projection: after, text };
}
