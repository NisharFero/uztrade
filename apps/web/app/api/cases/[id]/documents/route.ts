import { getRuntimeEnv } from "@/modules/runtime/env";
const env = getRuntimeEnv();
import { DOCAI_URL_DEFAULT } from "../../../../../modules/documents/docai/client";
import { documentReaderFrom } from "../../../../../modules/documents/docai/reader";
import { ingestDocument, type DocsBucket } from "../../../../../modules/documents/ingest";
import { documentBucket } from "../../../../../modules/documents/storage";
import { docTypeOf } from "../../../../../modules/documents/specs";
import { HttpError, routeError } from "../../../../../modules/shared/http";
import { syncCaseBlockProgress } from "../../../../../modules/cases/block-progress";
import { assistantView } from "../../../../../modules/steps/assistant";
import { loadCase } from "../../../../../modules/steps/context";
import { llmFromEnv, type LlmEnv } from "../../../../../modules/ai/llm";
import { agenticAiFromEnv } from "../../../../../modules/workflow/agentic-ai";
import { portalsFromEnv, type PortalEnv } from "../../../../../modules/portals/client";

/* Vercel's default function timeout is shorter than a model call plus the work
 * around it: reads an uploaded document with a vision model.
 * 60 s is the Hobby plan's ceiling and well inside Pro's. */
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 15 * 1024 * 1024;
const bindings = env as unknown as { DOCS?: DocsBucket; GROQ_API_KEY?: string; GROQ_MODEL?: string; DOCAI_URL?: string };

/** Upload a document for a step: kept, read, cross-checked and recorded in the
 *  case ledger (modules/documents/ingest.ts). A paused agent step resumes if
 *  this was what it needed. */
export async function POST(request: Request, { params }: Ctx) {
  const deadline = Date.now() + 50_000;
  try {
    const { id } = await params;
    const c = await loadCase(id);

    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
      throw new HttpError(415, "multipart/form-data is required");
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") throw new HttpError(400, "file is required");
    const stepNum = Number(form.get("stepNum"));
    const label = String(form.get("label") ?? "").trim();
    if (!Number.isFinite(stepNum) || !label) throw new HttpError(400, "stepNum and label are required");
    if (file.size === 0) throw new HttpError(400, "The uploaded file is empty");
    if (file.size > MAX_BYTES) throw new HttpError(413, "Files up to 15 MB are accepted");
    if (!/^(image\/(png|jpe?g|webp)|application\/pdf)$/i.test(file.type)) {
      throw new HttpError(415, "Upload a PNG, JPEG, WebP or PDF document");
    }

    const projection = await c.repository.getProjection(c.runId);
    const { record, projection: after } = await ingestDocument({
      repository: c.repository,
      runId: c.runId,
      caseId: id,
      procedure: c.procedure,
      query: c.found.query,
      facts: projection.shipmentFacts,
      bytes: await file.arrayBuffer(),
      fileName: file.name || "document",
      contentType: file.type || "application/octet-stream",
      label,
      stepNum,
      docType: docTypeOf(label),
      bucket: documentBucket(bindings),
      docaiUrl: bindings.DOCAI_URL || DOCAI_URL_DEFAULT,
      reader: documentReaderFrom(bindings, bindings.DOCAI_URL),
      llm: llmFromEnv(env as unknown as LlmEnv),
      ai: agenticAiFromEnv(bindings),
      portals: portalsFromEnv(env as unknown as PortalEnv),
      deadline,
    });

    await syncCaseBlockProgress(after);
    return Response.json({ document: record, view: assistantView(c.procedure, after, id) }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
