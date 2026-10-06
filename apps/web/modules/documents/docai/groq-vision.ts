/* Reading a document with one call to a vision model.
 *
 * This replaces the two-model pipeline that came before it - EasyOCR for the
 * words, LayoutLM for "which word answers this question" - with a single
 * request to a vision model on Groq. The document goes up as an image; what
 * comes back is a transcript of the page and one answer per field of the spec.
 *
 * The part that matters is what is *not* trusted. A vision model reports its
 * own confidence, and a confident misreading looks exactly like a confident
 * reading. So every field must also quote the text it read the value from, and
 * that quote is checked against the transcript the same call produced:
 *
 *   quote found in the transcript, confidence >= 0.80  ->  accepted
 *   quote found, confidence 0.50-0.79                  ->  review, pre-filled
 *   quote not in the transcript                        ->  never accepted
 *
 * The scores are handed to compose.ts, which owns the gates, so a document read
 * this way passes through exactly the same checks as one read by the old
 * service - and `modules/documents/docai/client.ts` remains the fallback.
 */

import type { DocSpec } from "../specs";
import type { Candidate, DocaiResponse } from "./compose";
import { GATE } from "./compose";

/** Groq's vision models take images, not PDFs. A PDF has to be rasterized
 *  first, which is what the DocAI service is for. */
export class UnsupportedDocumentFormat extends Error {}

/* Which vision models to try, best first. Groq accounts differ in what they
 * expose - a key with no Llama 4 access answers 404 `model_not_found` - so the
 * first one the account actually has is used and remembered. `GROQ_VISION_MODEL`
 * overrides the list entirely. */
export const GROQ_VISION_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "qwen/qwen3.8-27b",
];
export const GROQ_VISION_MODEL_DEFAULT = GROQ_VISION_MODELS[0];

/** The model this process has already seen work, so the 404s are paid once. */
let known: string | null = null;
const GROQ_URL_DEFAULT = "https://api.groq.com/openai/v1";

/** What Groq's vision endpoint accepts. */
const IMAGE_TYPES = /^image\/(jpeg|jpg|png|webp|gif)$/i;
const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif)$/i;

/** Base64 of the image counts against the request; keep well inside Groq's
 *  4 MB limit for an inline data URL. */
const MAX_BYTES = 3 * 1024 * 1024;

/** Asked again after the model could not finish its JSON. The transcript is
 *  what overruns a small budget on a dense page, so ask for less of it. */
const SYSTEM_COMPACT_NOTE = [
  "This page is too dense to transcribe in the space you have.",
  'Answer with {"transcript": "", "fields": {…}} - no transcript at all - and give each field its value, the short line you read it from as the quote, and your confidence.',
  "Every value must still be read off this page; leave a field null rather than guessing it.",
].join("\n");

const SYSTEM = [
  "You read scanned trade documents - invoices, waybills, certificates, declarations - in English, Russian or Uzbek.",
  "First transcribe the lines of text that carry information - headings, labels and the values beside them - in reading order, keeping numbers and codes exactly as printed. Skip decorative rules, page furniture and repeated boilerplate.",
  "Then answer each requested field from that transcript only.",
  "For every field give: value (exactly as printed, no reformatting), quote (the surrounding line of text you read it from, copied verbatim from your transcript), and confidence between 0 and 1.",
  "If a field is not on the page, give value null - never guess, never carry a value over from another field.",
  "A printed label with nothing filled in beside it is not a value: a blank form has null for those fields.",
  'JSON shape: {"transcript": "...", "fields": {"<key>": {"value": "...", "quote": "...", "confidence": 0.0}}}',
].join("\n");

/** Groq's free tier allows 1000 output tokens per minute per model, and a
 *  request asking for more than that is refused outright (HTTP 429, "Request
 *  too large") rather than truncated. Accounts with a higher limit can raise
 *  this with GROQ_VISION_MAX_TOKENS and get fuller transcripts of dense pages. */
export const MAX_TOKENS_DEFAULT = 1000;

/** Groq's token windows refill in seconds, so one wait is usually the
 *  difference between a read and a blank document. Only one: a demo user is
 *  watching, and the caller has a fallback. */
const RETRY_AFTER_MAX_MS = 20_000;

export type GroqVisionOptions = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Overall budget for the call. */
  timeoutMs?: number;
  /** Output tokens: the transcript plus the fields. */
  maxTokens?: number;
};

type Input = { bytes: ArrayBuffer; fileName: string; contentType: string; spec: DocSpec };

export function canReadWithVision(contentType: string, fileName: string): boolean {
  return IMAGE_TYPES.test(contentType) || IMAGE_EXTENSION.test(fileName);
}

export async function parseWithGroqVision(input: Input, options: GroqVisionOptions): Promise<DocaiResponse> {
  if (!canReadWithVision(input.contentType, input.fileName)) {
    throw new UnsupportedDocumentFormat(
      `${input.fileName} is not an image. A vision model reads images; PDFs are rasterized by the document AI service.`,
    );
  }
  if (input.bytes.byteLength > MAX_BYTES) {
    throw new UnsupportedDocumentFormat(
      `${input.fileName} is ${Math.round(input.bytes.byteLength / 1024 / 1024)} MB; the vision model takes images under 3 MB.`,
    );
  }

  const fields = input.spec.fields.filter((f) => f.questions.length || f.anchors.length);
  const asked = fields.map((f) => `- ${f.key}: ${f.questions[0] ?? f.name}${f.anchors.length ? ` (printed as: ${f.anchors.slice(0, 3).join(", ")})` : ""}`);
  const prompt = [
    `Document type: ${input.spec.type.replace(/_/g, " ")}.`,
    "",
    "Fields to answer:",
    ...asked,
    "",
    "Reply with one JSON object and nothing else.",
  ].join("\n");

  const doFetch = options.fetch ?? fetch;
  const signal = AbortSignal.timeout(options.timeoutMs ?? 30_000);
  const url = `${(options.baseUrl || GROQ_URL_DEFAULT).replace(/\/$/, "")}/chat/completions`;
  const image = dataUrl(input.bytes, input.contentType, input.fileName);
  const candidates = options.model ? [options.model] : known ? [known] : GROQ_VISION_MODELS;

  const requestBody = (candidate: string, compact = false) =>
    JSON.stringify({
      model: candidate,
      temperature: 0,
      max_tokens: options.maxTokens ?? MAX_TOKENS_DEFAULT,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: compact ? `${SYSTEM}\n${SYSTEM_COMPACT_NOTE}` : SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
    });

  let content = "";
  let model = candidates[0];
  let lastError = "";
  let waited = false;
  let retriedCompact = false;
  for (const candidate of candidates) {
    let response = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
      body: requestBody(candidate),
      signal,
    });

    // The model could not finish its JSON inside the budget - a dense page.
    // Ask once more for a shorter transcript before giving up on the page.
    if (response.status === 400 && !retriedCompact) {
      const why = await response.clone().text().catch(() => "");
      if (/failed to generate json/i.test(why)) {
        retriedCompact = true;
        response = await doFetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
          body: requestBody(candidate, true),
          signal,
        });
      }
    }

    // A token window that refills in a few seconds: wait it out once rather
    // than handing the trader a blank document.
    if (response.status === 429 && !waited) {
      const after = Number(response.headers.get("retry-after")) * 1000;
      const wait = Number.isFinite(after) && after > 0 ? Math.min(after, RETRY_AFTER_MAX_MS) : 5_000;
      waited = true;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, wait);
        signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
      });
      response = await doFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
        body: requestBody(candidate),
        signal,
      });
    }

    if (response.ok) {
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      content = body.choices?.[0]?.message?.content ?? "";
      model = candidate;
      if (!options.model) known = candidate;
      break;
    }

    const detail = await response.text().catch(() => "");
    lastError =
      response.status === 429
        ? `HTTP 429: the model's rate limit is in use — ${detail.slice(0, 160)}`
        : `HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`;
    // Only "this account has no such model" is worth trying the next one for;
    // a rate limit or a bad image would fail the same way on all of them.
    if (!(response.status === 404 && /model/i.test(detail))) break;
  }

  if (!model || (!content && lastError)) throw new Error(`Groq vision failed with ${lastError || "an empty answer"}`);
  const answer = parseJson(content);
  if (!answer) {
    throw new Error(
      `${model} did not return readable JSON for ${input.fileName} - the answer was cut off or malformed (${content.length} characters).`,
    );
  }
  const transcript = typeof answer.transcript === "string" ? answer.transcript : "";
  /* A page read without a transcript - the compact pass, for a page whose text
     does not fit the token budget. The values are still read off the page, but
     nothing independent confirms them, so none of them may be auto-accepted.
     That is better than the alternative on offer, which is a blank document. */
  const unverifiable = retriedCompact && !transcript.trim();

  return {
    docType: input.spec.type,
    pages: [{ width: 0, height: 0, segments: transcript.split("\n").filter(Boolean).length }],
    text: transcript || (unverifiable ? quotesOf(answer.fields) : ""),
    fields: Object.fromEntries(
      fields.map((field) => {
        const read = readField(answer.fields?.[field.key]);
        if (!read) return [field.key, { candidates: [] as Candidate[] }];
        const verified = !unverifiable && quoteIsOnThePage(read.quote, transcript) && valueIsOnThePage(read.value, transcript);
        return [
          field.key,
          {
            candidates: [
              {
                value: read.value,
                // A value the transcript does not support is never auto-accepted,
                // however sure the model says it is.
                score: verified ? read.confidence : Math.min(read.confidence, GATE.accept - 0.01),
                source: verified ? "groq-vision" : unverifiable ? "groq-vision-no-transcript" : "groq-vision-unverified",
                page: 0,
                question: field.questions[0] ?? field.name,
                anchor: read.quote || undefined,
              },
            ],
          },
        ];
      }),
    ),
    models: { ocr: model, qa: model },
    readability: transcript.trim()
      ? { readable: true, medianHeight: 0, meanConfidence: 1, reason: "read by a vision model" }
      : unverifiable
        ? {
            readable: true,
            medianHeight: 0,
            meanConfidence: 0.5,
            reason: "too dense to transcribe in full — every value needs confirming",
          }
        : { readable: false, medianHeight: 0, meanConfidence: 0, reason: "the model transcribed nothing from this image" },
  };
}

/* ------------------------------------------------------------------ bits --- */

/** The lines the model says it read each value from - all the text there is
 *  when the page was too dense to transcribe. */
function quotesOf(raw: Record<string, unknown> | undefined): string {
  return Object.values(raw ?? {})
    .map((f) => readField(f)?.quote)
    .filter((q): q is string => Boolean(q))
    .join("\n");
}

function dataUrl(bytes: ArrayBuffer, contentType: string, fileName: string): string {
  const type = IMAGE_TYPES.test(contentType)
    ? contentType
    : /\.png$/i.test(fileName)
      ? "image/png"
      : /\.webp$/i.test(fileName)
        ? "image/webp"
        : /\.gif$/i.test(fileName)
          ? "image/gif"
          : "image/jpeg";
  return `data:${type};base64,${base64(bytes)}`;
}

function base64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  // Chunked: String.fromCharCode(...view) blows the argument limit on a 3 MB image.
  for (let i = 0; i < view.length; i += 8192) binary += String.fromCharCode(...view.subarray(i, i + 8192));
  return btoa(binary);
}

type RawField = { value?: unknown; quote?: unknown; confidence?: unknown };

function readField(raw: unknown): { value: string; quote: string; confidence: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const { value, quote, confidence } = raw as RawField;
  const text = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
  if (!text || /^(null|none|n\/a|not found|-)$/i.test(text)) return null;
  const score = typeof confidence === "number" && confidence >= 0 && confidence <= 1 ? confidence : 0.5;
  return { value: text, quote: typeof quote === "string" ? quote.trim() : "", confidence: score };
}

/** Punctuation, spacing and case differ between a quote and the transcript far
 *  more often than the characters do. */
const flatten = (s: string) => s.toLowerCase().replace(/[^a-z0-9Ѐ-ӿ]+/g, "");

function quoteIsOnThePage(quote: string, transcript: string): boolean {
  const q = flatten(quote);
  if (q.length < 3) return false;
  return flatten(transcript).includes(q);
}

/** The value itself has to be in the transcript too: a quote can be real while
 *  the value read out of it is not. */
function valueIsOnThePage(value: string, transcript: string): boolean {
  const v = flatten(value);
  if (!v) return false;
  return flatten(transcript).includes(v);
}

type Answer = { transcript?: unknown; fields?: Record<string, unknown> };

/** Null when the answer is not usable JSON - a cut-off reply, or prose. */
function parseJson(content: string): Answer | null {
  try {
    const parsed = JSON.parse(content) as Answer;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    // Some models wrap the object in prose or a code fence.
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(content.slice(start, end + 1)) as Answer;
    } catch {
      return null;
    }
  }
}
