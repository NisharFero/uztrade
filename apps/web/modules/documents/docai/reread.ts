/* A second reading of the fields the layout model wasn't sure of (confidence
 * 0.50-0.80, or required and not found), from the page's OCR text.
 *
 * The OCR text is document data, so this runs only on a local model - with no
 * local model nothing changes. The model must quote the line it read each
 * value from; a quote that isn't in the OCR text, or a value that isn't in its
 * quote or fails the field's validator, is discarded. What survives:
 *
 *   agrees with the layout model's value  -> accepted (two independent readings)
 *   a value where none was found          -> review, pre-filled (the trader confirms)
 *   a different value                     -> review, offered as the first alternative
 */

import { z } from "zod";
import { llmJson, providerFor, type LlmClient } from "../../ai/llm";
import type { ExtractedField } from "./compose";
import { normalizeValue } from "./validate";

const Reading = z.object({
  fields: z.array(z.object({ key: z.string(), value: z.string().nullish(), quote: z.string().nullish() })).max(40),
});

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const MAX_TEXT = 9000;

export async function rereadUncertainFields(fields: ExtractedField[], ocrText: string, llm: LlmClient | undefined): Promise<{ fields: ExtractedField[]; reread: string[] }> {
  const targets = fields.filter((f) => f.status === "review" || (f.status === "missing" && f.required)).slice(0, 15);
  if (!targets.length || !ocrText.trim() || !providerFor(llm, "document")) return { fields, reread: [] };

  const answer = await llmJson(llm, {
    sensitivity: "document",
    system:
      "You read values from the OCR text of one trade document (Russian and English). For each requested field give the value exactly as printed and quote the OCR line it is on. Use null when the text doesn't contain it. Never invent a value.",
    prompt: JSON.stringify({
      ocr: ocrText.slice(0, MAX_TEXT),
      fields: targets.map((f) => ({ key: f.key, label: f.label, kind: f.kind, firstReading: f.value })),
    }),
    schema: Reading,
    maxTokens: 1500,
  });
  if (!answer) return { fields, reread: [] };

  const text = squash(ocrText);
  const byKey = new Map(answer.data.fields.map((r) => [r.key, r]));
  const reread: string[] = [];
  const next = fields.map((field) => {
    if (!targets.includes(field)) return field;
    const r = byKey.get(field.key);
    if (!r?.value || !r.quote) return field;
    const quote = squash(r.quote);
    if (!quote || !text.includes(quote) || !quote.includes(squash(r.value))) return field;
    const checked = normalizeValue(field.kind, r.value);
    if (!checked.ok) return field;

    reread.push(field.key);
    const first = field.value ? normalizeValue(field.kind, field.value) : null;
    const source = `reread:${answer.model}`;
    if (first?.ok && String(first.normalized) === String(checked.normalized)) {
      return { ...field, status: "accepted" as const, confidence: Math.max(field.confidence, 0.85), source: `${field.source ?? "layoutlm"}+${source}` };
    }
    if (!field.value) {
      return { ...field, value: r.value.trim(), normalized: checked.normalized, status: "review" as const, confidence: 0.6, source };
    }
    return { ...field, status: "review" as const, alternatives: [r.value.trim(), ...field.alternatives.filter((a) => a !== r.value)].slice(0, 3) };
  });
  return { fields: next, reread };
}
