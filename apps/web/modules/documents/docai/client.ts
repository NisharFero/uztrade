/* Calls the local document AI service (apps/docai). */

import type { DocSpec } from "../specs";
import type { DocaiResponse } from "./compose";

export const DOCAI_URL_DEFAULT = "http://127.0.0.1:8765";

export class DocaiUnavailable extends Error {}

export async function parseWithDocai(
  input: { bytes: ArrayBuffer; fileName: string; contentType: string; spec: DocSpec },
  baseUrl = DOCAI_URL_DEFAULT,
): Promise<DocaiResponse> {
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
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/parse`, { method: "POST", body: form, signal: AbortSignal.timeout(240_000) });
  } catch (error) {
    throw new DocaiUnavailable(
      `The document AI service isn't reachable at ${baseUrl} — start it with apps/docai/run.sh (${error instanceof Error ? error.message : "network error"}).`,
    );
  }
  const body = (await response.json().catch(() => ({}))) as DocaiResponse & { detail?: string };
  if (!response.ok) throw new Error(body.detail ?? `Document AI failed with HTTP ${response.status}`);
  return body;
}
