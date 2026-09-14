import { env } from "cloudflare:workers";
import { routeError } from "../../../../../../../modules/shared/http";
import { loadCase } from "../../../../../../../modules/steps/context";
import { buildLedger } from "../../../../../../../modules/steps/ledger";

type Bucket = { get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null> };
type Ctx = { params: Promise<{ id: string; docId: string }> };

/** The original uploaded file, from R2. */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id, docId } = await params;
    const c = await loadCase(id);
    const doc = buildLedger((await c.repository.getProjection(c.runId)).artifacts).documents.find((d) => d.docId === docId);
    const bucket = (env as unknown as { DOCS?: Bucket }).DOCS;
    if (!doc?.r2Key || !bucket) return Response.json({ error: "Original file not stored" }, { status: 404 });
    const object = await bucket.get(doc.r2Key);
    if (!object) return Response.json({ error: "Original file not found" }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": object.httpMetadata?.contentType ?? doc.contentType,
        "content-disposition": `inline; filename="${doc.fileName.replace(/"/g, "")}"`,
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
