/* A pack of documents dropped in at once.
 *
 * Each file has to find its own place: the file name says what it is when it
 * can ("invoice_17.pdf"), otherwise the page is read once and the printed
 * title decides (doctype.ts). Only when neither settles it is a local model
 * asked to name the type from the page text - document data, so never a
 * hosted one - and a file nobody can place is listed for you to label rather
 * than filed as a guess.
 *
 * The type then picks the need it answers: the first step still open whose
 * inputs ask for a document of that type. */

import { z } from "zod";
import { llmJson, providerFor, type LlmClient } from "../ai/llm";
import type { Procedure } from "../procedures/data/procedures.generated";
import type { WorkflowProjection } from "../workflow/repository";
import { detectDocType } from "./docai/doctype";
import { DOC_SPECS, docTypeOf, specFor, type DocSpec, type DocType } from "./specs";

export type PackFileResult = {
  fileName: string;
  docType: DocType | null;
  /** How the type was settled. */
  from: "name" | "page" | "model" | null;
  label: string | null;
  stepNum: number;
  status: "stored" | "unlabelled";
  accepted: number;
  review: number;
  note: string | null;
};

/** A spec that asks no questions: the service reads the page and nothing else. */
export const DETECT_SPEC: DocSpec = { type: "commercial_invoice", name: "detect", purpose: "", specimen: "", fields: [], supporting: [], checks: [] };

const isDone = (state: string) => state === "completed" || state === "skipped";

/** The need a document of this type answers: the earliest step still open that asks for one. */
export function labelForType(procedure: Procedure, projection: WorkflowProjection, type: DocType): { label: string; stepNum: number } | null {
  const open = new Set(projection.nodes.filter((n) => !isDone(n.state)).map((n) => n.stepNum));
  const steps = procedure.blocks.flatMap((b) => b.steps).sort((a, b) => a.num - b.num);
  for (const step of steps) {
    if (!open.has(step.num)) continue;
    const input = step.inputs.find((label) => docTypeOf(label) === type);
    if (input) return { label: input, stepNum: step.num };
  }
  return null;
}

const Named = z.object({ docType: z.string(), why: z.string().max(200).nullish() });

/** The type a local model reads off the page text; null when it names something unknown. */
export async function classifyPage(text: string, llm?: LlmClient): Promise<DocType | null> {
  if (!text.trim() || !providerFor(llm, "document")) return null;
  const types = Object.values(DOC_SPECS).map((spec) => ({ type: spec.type, name: spec.name, purpose: spec.purpose }));
  const answer = await llmJson(llm, {
    sensitivity: "document",
    system: "Name which of the listed trade documents this page text is. Use the type exactly as listed. If it is none of them, answer with an empty docType.",
    prompt: JSON.stringify({ page: text.slice(0, 4000), types }),
    schema: Named,
    maxTokens: 300,
  });
  const named = answer?.data.docType?.trim();
  return named && named in DOC_SPECS ? (named as DocType) : null;
}

/** A file name as the document labels read: "commercial-invoice-17.pdf" -> "commercial invoice 17". */
export const nameAsLabel = (fileName: string) =>
  fileName
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The type of one file, and how it was settled - without reading the page twice. */
export async function typeOfFile(input: {
  fileName: string;
  /** The page text, when the file name didn't settle it. */
  text?: string;
  llm?: LlmClient;
}): Promise<{ docType: DocType | null; from: PackFileResult["from"] }> {
  const byName = docTypeOf(nameAsLabel(input.fileName));
  if (byName) return { docType: byName, from: "name" };
  if (!input.text?.trim()) return { docType: null, from: null };
  const byPage = detectDocType(input.text);
  if (byPage) return { docType: byPage, from: "page" };
  const byModel = await classifyPage(input.text, input.llm);
  return byModel ? { docType: byModel, from: "model" } : { docType: null, from: null };
}

export const packNote = (result: Pick<PackFileResult, "status" | "docType" | "from">) =>
  result.status === "unlabelled"
    ? "Couldn't tell what this is — label it and upload it at its step"
    : `Read as ${result.docType ? specFor(result.docType).name.toLowerCase() : "a document"} (${result.from === "name" ? "from the file name" : result.from === "page" ? "from the printed title" : "named by the local model"})`;
