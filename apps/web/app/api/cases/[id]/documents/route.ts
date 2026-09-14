import { env } from "cloudflare:workers";
import { blankFields } from "../../../../lib/docai/blank";
import { DOCAI_URL_DEFAULT, parseWithDocai } from "../../../../lib/docai/client";
import { composeDocument, type ParsedDocument } from "../../../../lib/docai/compose";
import { crossCheck } from "../../../../lib/docai/crosscheck";
import { docTypeOf, specFor } from "../../../../lib/document-specs";
import { HttpError, routeError } from "../../../../lib/http";
import { syncCaseBlockProgress } from "../../../../lib/legacy-progress";
import { assistantView } from "../../../../lib/steps/assistant";
import { checkContext, loadCase } from "../../../../lib/steps/context";
import { buildLedger, nextVersion, type DocumentRecord } from "../../../../lib/steps/ledger";
import { recordDocument } from "../../../../lib/steps/service";

type Bucket = {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
};
type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 15 * 1024 * 1024;
const bindings = env as unknown as { DOCS?: Bucket; DOCAI_URL?: string };

/** Upload a document for a step: keep the original in R2, read it with the
 *  document AI, validate and cross-check the fields, and record it in the
 *  case ledger. A paused agent step resumes if this was what it needed. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const c = await loadCase(id);

    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") throw new HttpError(400, "file is required");
    const stepNum = Number(form.get("stepNum"));
    const label = String(form.get("label") ?? "").trim();
    if (!Number.isFinite(stepNum) || !label) throw new HttpError(400, "stepNum and label are required");
    if (file.size > MAX_BYTES) throw new HttpError(413, "Files up to 15 MB are accepted");

    const bytes = await file.arrayBuffer();
    const fileName = file.name || "document";
    const contentType = file.type || "application/octet-stream";
    const docType = docTypeOf(label);
    const docId = `doc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

    let r2Key: string | null = null;
    if (bindings.DOCS) {
      r2Key = `cases/${id}/${docId}/${fileName.replace(/[^\w.-]+/g, "_")}`;
      await bindings.DOCS.put(r2Key, bytes, { httpMetadata: { contentType } });
    }

    const projection = await c.repository.getProjection(c.runId);
    const ledger = buildLedger(projection.artifacts);

    let parsed: ParsedDocument | null = null;
    let parseError: string | null = null;
    if (docType) {
      try {
        const spec = specFor(docType);
        parsed = composeDocument(spec, await parseWithDocai({ bytes, fileName, contentType, spec }, bindings.DOCAI_URL || DOCAI_URL_DEFAULT));
        if (parsed.unreadable) parseError = parsed.unreadable;
      } catch (error) {
        parseError = error instanceof Error ? error.message : "The document could not be read";
      }
    }

    const fields = parsed?.fields ?? (docType ? blankFields(specFor(docType)) : []);
    const record: DocumentRecord = {
      docId,
      version: nextVersion(),
      label,
      docType,
      stepNum,
      fileName,
      contentType,
      size: bytes.byteLength,
      r2Key,
      fields,
      checks: parsed && docType ? crossCheck(docType, fields, checkContext(c.procedure, projection.shipmentFacts, c.found.query, ledger, stepNum)) : [],
      detectedType: parsed?.detectedType ?? null,
      typeMatches: parsed?.typeMatches ?? true,
      confirmed: false,
      parseError,
      pages: parsed?.pages ?? 0,
      timingsMs: parsed?.timings?.total_ms ?? null,
      parsedAt: new Date().toISOString(),
    };

    const after = await recordDocument(c.repository, c.runId, record);
    await syncCaseBlockProgress(after);
    return Response.json({ document: record, view: assistantView(c.procedure, after, id) }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
