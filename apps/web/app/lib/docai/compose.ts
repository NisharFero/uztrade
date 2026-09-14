/* Turns the document AI's candidates into one value per field, with a
 * confidence and a status the step gate understands.
 *
 *   accepted  >= 0.80   used as is (the trader can still edit)
 *   review    >= 0.50   shown pre-filled; the trader must confirm it
 *   missing   <  0.50   not found - the trader types it or re-uploads
 *
 * Confidence starts from the model/anchor score, is cut when the value fails
 * its kind's validator or looks like a printed label (blank forms), and is
 * raised when the layout model and a label anchor agree. */

import type { DocField, DocSpec, DocType } from "../document-specs";
import { detectDocType } from "./doctype";
import { normalizeValue } from "./validate";

export const GATE = { accept: 0.8, review: 0.5 };

/* The layout model's score says how sure it is given the OCR words - not
 * whether OCR read them right. On the handwritten import SMGS (page OCR
 * confidence 0.30) it answered "6202" at 1.00 for a 68,000 kg weight. Readable
 * pages measured 0.75-0.77, so model scores are scaled by page OCR confidence
 * relative to 0.6 and only full-strength on a well-read page. */
export const OCR_TRUST = 0.6;

export type Candidate = { value: string; score: number; source: string; page?: number };

export type DocaiResponse = {
  docType?: string | null;
  pages: { width: number; height: number; segments: number }[];
  text: string;
  fields: Record<string, { candidates: Candidate[] }>;
  timings?: { ocr_ms: number; fields_ms: number; total_ms: number };
  models?: { ocr: string; qa: string };
  /** The service's verdict on whether OCR found text worth reading. */
  readability?: { readable: boolean; medianHeight: number; meanConfidence: number; reason: string };
};

export type FieldStatus = "accepted" | "review" | "missing" | "confirmed";

export type ExtractedField = {
  key: string;
  label: string;
  kind: DocField["kind"];
  required: boolean;
  value: string | null;
  normalized: string | number | null;
  confidence: number;
  status: FieldStatus;
  source: string | null;
  alternatives: string[];
};

export type ParsedDocument = {
  docType: DocType;
  detectedType: DocType | null;
  typeMatches: boolean;
  /** Why the scan couldn't be read (too small / too blurry), if it couldn't. */
  unreadable: string | null;
  fields: ExtractedField[];
  summary: { accepted: number; review: number; missing: number; requiredOpen: string[] };
  pages: number;
  timings: DocaiResponse["timings"] | null;
  models: DocaiResponse["models"] | null;
};

const round = (n: number) => Math.round(n * 100) / 100;

function labelPatterns(spec: DocSpec): RegExp[] {
  return spec.fields.flatMap((f) =>
    f.anchors.flatMap((a) => {
      try {
        return [new RegExp(a, "i")];
      } catch {
        return [];
      }
    }),
  );
}

/** How far to trust layout-model scores on a page with this OCR confidence. */
export function layoutTrust(response: Pick<DocaiResponse, "readability">): number {
  const confidence = response.readability?.meanConfidence;
  return confidence == null ? 1 : Math.max(0, Math.min(1, confidence / OCR_TRUST));
}

export function composeField(field: DocField, candidates: Candidate[], labels: RegExp[], layoutFactor = 1): ExtractedField {
  const scored = candidates
    .filter((c) => c.value && c.value.trim())
    .map((c) => {
      const v = normalizeValue(field.kind, c.value);
      const text = c.value.trim();
      // A printed label read back as a value - what blank forms produce.
      const labelish = labels.some((re) => re.test(text)) && text.length < 80 && !/\d{3,}/.test(text);
      let score = Math.max(0, Math.min(1, c.score));
      if (c.source === "layoutlm") score *= layoutFactor;
      if (labelish) score *= 0.2;
      if (!v.ok) score *= 0.35;
      return { ...c, value: text, v, score };
    });

  // Agreement between independent readings.
  for (const a of scored) {
    const agrees = scored.some(
      (b) => b !== a && b.source.split("-")[0] !== a.source.split("-")[0] && b.v.ok && a.v.ok && String(b.v.normalized) === String(a.v.normalized),
    );
    if (agrees) a.score = Math.min(0.99, a.score + 0.15);
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const base = { key: field.key, label: field.name, kind: field.kind, required: field.required };

  if (!best) return { ...base, value: null, normalized: null, confidence: 0, status: "missing", source: null, alternatives: [] };

  const status: FieldStatus = best.score >= GATE.accept ? "accepted" : best.score >= GATE.review ? "review" : "missing";
  return {
    ...base,
    value: best.value,
    normalized: best.v.normalized,
    confidence: round(best.score),
    status,
    source: best.source,
    alternatives: [...new Set(scored.slice(1).map((c) => c.value))].slice(0, 3),
  };
}

export function summarize(fields: ExtractedField[]): ParsedDocument["summary"] {
  return {
    accepted: fields.filter((f) => f.status === "accepted" || f.status === "confirmed").length,
    review: fields.filter((f) => f.status === "review").length,
    missing: fields.filter((f) => f.status === "missing").length,
    requiredOpen: fields.filter((f) => f.required && f.status !== "accepted" && f.status !== "confirmed").map((f) => f.label),
  };
}

/* Fields that name different parties of one document. */
const COUNTERPARTIES: [string, string][] = [
  ["seller", "buyer"],
  ["seller", "consignee"],
  ["exporter", "consignee"],
  ["shipper", "consignee"],
  ["sender", "consignee"],
  ["supplier", "customer"],
  ["payer", "recipient"],
];

const comparable = (value: string) =>
  value
    .toLowerCase()
    .replace(/["'«»“”„]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/* The layout model can give one answer to two different questions - on the
 * synthetic invoice it named the seller as both seller and buyer. Two
 * counterparties can't be the same company, so that answer is kept only where
 * the field's own label line agrees with it; elsewhere it is dropped and the
 * field falls back to its label reading, which the trader then confirms. */
function separateCounterparties(fields: ExtractedField[], specFields: DocField[], raw: Record<string, Candidate[]>, labels: RegExp[], trust: number) {
  let result = fields;
  for (const [a, b] of COUNTERPARTIES) {
    const first = result.find((f) => f.key === a);
    const second = result.find((f) => f.key === b);
    if (!first?.value || !second?.value || first.source !== "layoutlm" || second.source !== "layoutlm") continue;
    const shared = comparable(first.value);
    if (shared !== comparable(second.value)) continue;
    for (const key of [a, b]) {
      const own = (raw[key] ?? []).filter((c) => c.source !== "layoutlm");
      if (own.some((c) => comparable(c.value).includes(shared) || shared.includes(comparable(c.value)))) continue;
      const spec = specFields.find((f) => f.key === key)!;
      const recomposed = composeField(spec, own, labels, trust);
      result = result.map((f) => (f.key === key ? recomposed : f));
    }
  }
  return result;
}

export function composeDocument(spec: DocSpec, response: DocaiResponse): ParsedDocument {
  const labels = labelPatterns(spec);
  const unreadable = response.readability && !response.readability.readable ? response.readability.reason || "The document couldn't be read" : null;
  const trust = layoutTrust(response);
  const specFields = spec.fields.filter((f) => f.questions.length || f.anchors.length);
  // Nothing read from an unreadable page is trusted - every field goes to the trader.
  const raw: Record<string, Candidate[]> = Object.fromEntries(
    specFields.map((f) => [f.key, unreadable ? [] : response.fields[f.key]?.candidates ?? []]),
  );
  const fields = separateCounterparties(
    specFields.map((f) => composeField(f, raw[f.key], labels, trust)),
    specFields,
    raw,
    labels,
    trust,
  );
  const detectedType = unreadable ? null : detectDocType(response.text);
  return {
    docType: spec.type,
    detectedType,
    typeMatches: !detectedType || detectedType === spec.type,
    unreadable,
    fields,
    summary: summarize(fields),
    pages: response.pages.length,
    timings: response.timings ?? null,
    models: response.models ?? null,
  };
}

/** The trader's corrections: a typed value is confirmed at full confidence;
 *  confirming without typing keeps the parsed value. */
export function applyCorrections(fields: ExtractedField[], corrections: Record<string, string | null>, confirmAll = false): ExtractedField[] {
  return fields.map((f) => {
    if (f.key in corrections) {
      const typed = (corrections[f.key] ?? "").trim();
      if (!typed) return { ...f, value: null, normalized: null, confidence: 0, status: "missing" };
      const v = normalizeValue(f.kind, typed);
      return { ...f, value: typed, normalized: v.normalized, confidence: 1, status: "confirmed", source: "trader" };
    }
    if (confirmAll && f.value) return { ...f, confidence: Math.max(f.confidence, 1), status: "confirmed" };
    return f;
  });
}
