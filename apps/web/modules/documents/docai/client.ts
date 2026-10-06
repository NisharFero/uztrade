/* Calls the local document AI service (apps/docai). */

import type { DocSpec } from "../specs";
import type { DocaiResponse } from "./compose";

export const DOCAI_URL_DEFAULT = process.env.DOCAI_URL || (process.env.VERCEL ? "" : "http://127.0.0.1:8765");

export class DocaiUnavailable extends Error {}

export async function parseWithDocai(
  input: { bytes: ArrayBuffer; fileName: string; contentType: string; spec: DocSpec },
  baseUrl = DOCAI_URL_DEFAULT,
  timeoutMs = 35_000,
): Promise<DocaiResponse> {
  if (!baseUrl) {
    // No document service deployed. Images are read by the vision model
    // (docai/groq-vision.ts); a PDF has to be rasterized first, which is what
    // that service does - so say what will work instead of naming a variable.
    throw new DocaiUnavailable(
      `${input.fileName} couldn't be read: PDFs need the document service, which isn't deployed. Upload a photo or a PNG/JPG of the page and it will be read.`,
    );
  }
  const form = new FormData();
  form.append("file", new Blob([input.bytes], { type: input.contentType || "application/octet-stream" }), input.fileName);
  form.append(
    "spec",
    JSON.stringify({
      docType: input.spec.type,
      fields: input.spec.fields
        .filter((f) => f.questions.length || f.anchors.length)
        .map((f) => ({ key: f.key, questions: f.questions, anchors: f.anchors })),
    }),
  );

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/parse`, { method: "POST", body: form, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new DocaiUnavailable(
      `The document AI service isn't reachable at ${baseUrl} — start it with apps/docai/run.sh (${error instanceof Error ? error.message : "network error"}).`,
    );
  }
  const body = (await response.json().catch(() => ({}))) as DocaiResponse & { detail?: string };
  if (!response.ok) throw new Error(body.detail ?? `Document AI failed with HTTP ${response.status}`);
  return body;
}
