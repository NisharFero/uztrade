import { getRuntimeEnv } from "@/modules/runtime/env";
const env = getRuntimeEnv();
import { llmFromEnv, type LlmEnv } from "../../../../../../modules/ai/llm";
import { syncCaseBlockProgress } from "../../../../../../modules/cases/block-progress";
import { DOCAI_URL_DEFAULT } from "../../../../../../modules/documents/docai/client";
import { parseUploadedDocument } from "../../../../../../modules/documents/docai/upload";
import { ingestDocument, type DocsBucket } from "../../../../../../modules/documents/ingest";
import { documentBucket } from "../../../../../../modules/documents/storage";
import { DETECT_SPEC, labelForType, packNote, typeOfFile, type PackFileResult } from "../../../../../../modules/documents/pack";
import { specFor } from "../../../../../../modules/documents/specs";
import { HttpError, routeError } from "../../../../../../modules/shared/http";
import { assistantView } from "../../../../../../modules/steps/assistant";
import { loadCase } from "../../../../../../modules/steps/context";
import { agenticAiFromEnv } from "../../../../../../modules/workflow/agentic-ai";
import { portalsFromEnv, type PortalEnv } from "../../../../../../modules/portals/client";

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 8;
const bindings = env as unknown as { DOCS?: DocsBucket; GROQ_API_KEY?: string; GROQ_MODEL?: string; DOCAI_URL?: string };

/** Everything you have, in one go: each file is typed, matched to the need it
 *  answers and read like any single upload. What can't be typed is reported,
 *  never guessed. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const c = await loadCase(id);
    const llm = llmFromEnv(env as unknown as LlmEnv);
    const docaiUrl = bindings.DOCAI_URL || DOCAI_URL_DEFAULT;

    const form = await request.formData();
    const files = form.getAll("files").filter((entry): entry is File => typeof entry !== "string");
    if (!files.length) throw new HttpError(400, "files are required");

    let projection = await c.repository.getProjection(c.runId);
    const results: PackFileResult[] = [];

    for (const file of files.slice(0, MAX_FILES)) {
      const fileName = file.name || "document";
      const contentType = file.type || "application/octet-stream";
      const unplaced = (note: string): PackFileResult => ({ fileName, docType: null, from: null, label: null, stepNum: 0, status: "unlabelled", accepted: 0, review: 0, note });
      if (file.size > MAX_BYTES) {
        results.push(unplaced("Larger than 15 MB"));
        continue;
      }

      const bytes = await file.arrayBuffer();
      let typed = await typeOfFile({ fileName, llm });
      if (!typed.docType) {
        // The page is read once here; the field pass reuses that reading.
        const probe = await parseUploadedDocument({ bytes, fileName, contentType, spec: DETECT_SPEC, baseUrl: docaiUrl });
        typed = await typeOfFile({ fileName, text: probe.text, llm });
      }
      if (!typed.docType) {
        results.push(unplaced(packNote({ status: "unlabelled", docType: null, from: null })));
        continue;
      }

      const target = labelForType(c.procedure, projection, typed.docType) ?? { label: specFor(typed.docType).name, stepNum: 0 };
      const ingested = await ingestDocument({
        repository: c.repository,
        runId: c.runId,
        caseId: id,
        procedure: c.procedure,
        query: c.found.query,
        facts: projection.shipmentFacts,
        bytes,
        fileName,
        contentType,
        label: target.label,
        stepNum: target.stepNum,
        docType: typed.docType,
        bucket: documentBucket(bindings),
        docaiUrl,
        llm,
        ai: agenticAiFromEnv(bindings),
        portals: portalsFromEnv(env as unknown as PortalEnv),
      });
      projection = ingested.projection;
      const fields = ingested.record.fields;
      results.push({
        fileName,
        docType: typed.docType,
        from: typed.from,
        label: target.label,
        stepNum: target.stepNum,
        status: "stored",
        accepted: fields.filter((f) => f.status === "accepted" || f.status === "confirmed").length,
        review: fields.filter((f) => f.status === "review").length,
        note: ingested.record.parseError ?? packNote({ status: "stored", docType: typed.docType, from: typed.from }),
      });
    }

    await syncCaseBlockProgress(projection);
    return Response.json({ results, view: assistantView(c.procedure, projection, id) }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
