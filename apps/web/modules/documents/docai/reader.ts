/* Which reader reads an uploaded document.
 *
 * Groq's vision model first: one call, no service to run, and it reads photos
 * and scans as well as clean renders. The DocAI service (apps/docai) stays as
 * the fallback for what the vision model cannot take - PDFs, which have to be
 * rasterized first - and for running without a Groq key at all.
 *
 * Whichever reads it, the answer is the same `DocaiResponse`, so the gates in
 * compose.ts and everything downstream cannot tell the difference except by the
 * model names recorded in the ledger.
 *
 * Note what this means for the document's contents: with a Groq key set, page
 * images are sent to Groq. `DOC_READER=docai` keeps documents on the DocAI
 * service instead.
 */

import type { DocSpec } from "../specs";
import { DOCAI_URL_DEFAULT, parseWithDocai } from "./client";
import type { DocaiResponse } from "./compose";
import { canReadWithVision, parseWithGroqVision } from "./groq-vision";

export type ReaderEnv = {
  GROQ_API_KEY?: string;
  GROQ_VISION_MODEL?: string;
  /** Output tokens per document read; the free tier allows 1000. */
  GROQ_VISION_MAX_TOKENS?: string;
  GROQ_URL?: string;
  DOCAI_URL?: string;
  /** "groq" (default when a key is set) or "docai" to keep documents off Groq. */
  DOC_READER?: string;
};

type ParseInput = { bytes: ArrayBuffer; fileName: string; contentType: string; spec: DocSpec };

export type DocumentReader = (input: ParseInput) => Promise<DocaiResponse>;

/** The reader for this environment, or undefined to let the caller use the
 *  service directly (which is what the tests and the demo path do). */
export function documentReaderFrom(env: ReaderEnv, docaiUrl?: string): DocumentReader | undefined {
  const key = env.GROQ_API_KEY?.trim();
  if (!key || env.DOC_READER === "docai") return undefined;

  const baseUrl = docaiUrl || env.DOCAI_URL || DOCAI_URL_DEFAULT;
  return async (input) => {
    const deadline = Date.now() + 35_000;
    if (canReadWithVision(input.contentType, input.fileName)) {
      try {
        const maxTokens = Number(env.GROQ_VISION_MAX_TOKENS);
        return await parseWithGroqVision(input, {
          apiKey: key,
          model: env.GROQ_VISION_MODEL,
          baseUrl: env.GROQ_URL,
          maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : undefined,
          timeoutMs: 20_000,
        });
      } catch (error) {
        // Rate limits, timeouts, an image the model refuses: fall through to the
        // service when there is one, and let the caller see the error when not.
        if (!baseUrl) throw error;
      }
    }
    return parseWithDocai(input, baseUrl, Math.max(1, deadline - Date.now()));
  };
}
