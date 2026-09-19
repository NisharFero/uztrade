import { demoDocumentByFile } from "../../demo/demo";
import type { DocSpec } from "../specs";
import { composeDocument, type DocaiResponse, type ParsedDocument } from "./compose";
import { parseWithDocai } from "./client";

export type UploadedDocumentParse = {
  document: ParsedDocument;
  parseError: string | null;
  fallback: "docai" | "demo" | "text" | "blank";
  /** The page text OCR read, for a second reading of uncertain fields (reread.ts). */
  text: string;
  models: DocaiResponse["models"] | null;
};

type ParseInput = {
  bytes: ArrayBuffer;
  fileName: string;
  contentType: string;
  spec: DocSpec;
  /** The case's procedure, so a demo file is looked up in its own pack first. */
  procedureId?: string | null;
  baseUrl?: string;
  parseWithAi?: (input: { bytes: ArrayBuffer; fileName: string; contentType: string; spec: DocSpec }) => Promise<DocaiResponse>;
};

export async function parseUploadedDocument(input: ParseInput): Promise<UploadedDocumentParse> {
  try {
    const response = input.parseWithAi
      ? await input.parseWithAi(input)
      : await parseWithDocai({ bytes: input.bytes, fileName: input.fileName, contentType: input.contentType, spec: input.spec }, input.baseUrl);
    const document = composeDocument(input.spec, response);
    return { document, parseError: document.unreadable, fallback: "docai", text: response.text ?? "", models: response.models ?? null };
  } catch (error) {
    const fallback = fallbackResponse(input);
    if (fallback) return { document: composeDocument(input.spec, fallback.response), parseError: null, fallback: fallback.kind, text: fallback.response.text, models: null };

    const message = error instanceof Error ? error.message : "The document could not be read";
    return {
      document: composeDocument(input.spec, blankResponse(message)),
      parseError: message,
      fallback: "blank",
      text: "",
      models: null,
    };
  }
}

function fallbackResponse(input: ParseInput): { response: DocaiResponse; kind: "demo" | "text" } | null {
  const demo = demoDocumentFor(input.fileName, input.spec, input.procedureId);
  if (demo) return { response: responseFromFields(input.spec, demo.title, demo.fields, "demo-pack"), kind: "demo" };

  const text = readableText(input.bytes, input.contentType, input.fileName);
  if (!text) return null;
  const fields = fieldsFromText(input.spec, text);
  return { response: responseFromFields(input.spec, text, fields, "text-layer"), kind: "text" };
}

function demoDocumentFor(fileName: string, spec: DocSpec, procedureId?: string | null) {
  return demoDocumentByFile(fileName, spec.type, procedureId)?.document ?? null;
}

function responseFromFields(spec: DocSpec, text: string, fields: Record<string, string>, source: "demo-pack" | "text-layer"): DocaiResponse {
  return {
    docType: spec.type,
    pages: [{ width: 1600, height: 2200, segments: Math.max(1, Object.keys(fields).length) }],
    text,
    fields: Object.fromEntries(
      spec.fields
        .filter((field) => field.questions.length || field.anchors.length)
        .map((field) => [
          field.key,
          {
            candidates: fields[field.key]
              ? [{ value: fields[field.key], score: 0.96, source, label: field.name, page: 0 }]
              : [],
          },
        ]),
    ),
    readability: { readable: true, medianHeight: 18, meanConfidence: 0.9, reason: "" },
    timings: { ocr_ms: 0, fields_ms: 0, total_ms: 0 },
    models: { ocr: source, qa: source },
  };
}

function blankResponse(reason: string): DocaiResponse {
  return {
    pages: [],
    text: "",
    fields: {},
    readability: { readable: false, medianHeight: 0, meanConfidence: 0, reason },
  };
}

function readableText(bytes: ArrayBuffer, contentType: string, fileName: string): string | null {
  const likelyText = /^text\//i.test(contentType) || /\.(csv|json|md|txt|xml)$/i.test(fileName);
  if (!likelyText && bytes.byteLength > 512_000) return null;
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\0/g, "");
  const compact = decoded.replace(/[^\S\r\n]+/g, " ").trim();
  if (!compact) return null;
  const printable = [...compact].filter((ch) => ch === "\n" || ch === "\r" || ch === "\t" || ch >= " ").length / compact.length;
  return likelyText || printable > 0.85 ? compact : null;
}

function fieldsFromText(spec: DocSpec, text: string): Record<string, string> {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return Object.fromEntries(
    spec.fields
      .filter((field) => field.questions.length || field.anchors.length)
      .map((field) => [field.key, extractFieldValue(field.anchors, lines)])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

function extractFieldValue(anchors: string[], lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    for (const anchor of anchors) {
      let re: RegExp;
      try {
        re = new RegExp(anchor, "i");
      } catch {
        continue;
      }
      if (!re.test(lines[i])) continue;
      const sameLine = lines[i].replace(re, "").replace(/^[\s:;#№/.-]+/, "").trim();
      if (sameLine) return sameLine;
      if (lines[i + 1]) return lines[i + 1];
    }
  }
  return null;
}
