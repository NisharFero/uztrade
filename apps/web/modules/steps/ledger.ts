/* The case ledger: everything the trader has given the case - values,
 * confirmations, channel choices and uploaded documents - stored as artifacts
 * on the workflow run. Every change is a new artifact version; the latest
 * version of each key wins, so the audit trail keeps every earlier one. */

import type { ExtractedField } from "../documents/docai/compose";
import type { CrossCheck } from "../documents/docai/crosscheck";
import type { DocType } from "../documents/specs";
import type { ArtifactRecord } from "../workflow/repository";

export const INPUT_ARTIFACT = "trader_input";
export const DOCUMENT_ARTIFACT = "uploaded_document";

export type InputKind = "value" | "confirm" | "variant";

export type InputRecord = { key: string; kind: InputKind; label: string; stepNum: number; value: string; version: number };

export type DocumentRecord = {
  docId: string;
  version: number;
  label: string;
  docType: DocType | null;
  stepNum: number;
  fileName: string;
  contentType: string;
  size: number;
  r2Key: string | null;
  fields: ExtractedField[];
  checks: CrossCheck[];
  detectedType: DocType | null;
  typeMatches: boolean;
  /** The trader confirmed the document (and every required field). */
  confirmed: boolean;
  parseError: string | null;
  pages: number;
  timingsMs: number | null;
  parsedAt: string;
};

export type Ledger = { inputs: Map<string, InputRecord>; documents: DocumentRecord[] };

export const labelKey = (label: string) =>
  label
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/[^a-z0-9а-яё']+/gi, " ")
    .trim();

/** Values are case-wide (a TIN given once is reused); confirmations and
 *  channel choices belong to one step. */
export function inputKey(kind: InputKind, stepNum: number, label = ""): string {
  if (kind === "value") return `value:${labelKey(label)}`;
  if (kind === "confirm") return `confirm:${stepNum}:${labelKey(label)}`;
  return `variant:${stepNum}`;
}

let sequence = 0;
/** Monotonic even within one millisecond. */
export const nextVersion = () => Date.now() * 1000 + (sequence++ % 1000);

export function buildLedger(artifacts: ArtifactRecord[]): Ledger {
  const inputs = new Map<string, InputRecord>();
  const documents = new Map<string, DocumentRecord>();
  for (const artifact of artifacts) {
    if (artifact.type === INPUT_ARTIFACT) {
      const record = artifact.data as unknown as InputRecord;
      if (!record?.key) continue;
      const previous = inputs.get(record.key);
      if (!previous || record.version >= previous.version) inputs.set(record.key, record);
    } else if (artifact.type === DOCUMENT_ARTIFACT) {
      const record = artifact.data as unknown as DocumentRecord;
      if (!record?.docId) continue;
      const previous = documents.get(record.docId);
      if (!previous || record.version >= previous.version) documents.set(record.docId, record);
    }
  }
  return {
    inputs,
    documents: [...documents.values()].sort((a, b) => a.stepNum - b.stepNum || a.version - b.version),
  };
}

/** A document satisfies a need when the trader confirmed it, or when it is the
 *  expected type and every required field was read with high confidence. */
export function documentComplete(doc: DocumentRecord): boolean {
  if (doc.confirmed) return true;
  if (!doc.docType || doc.parseError || !doc.typeMatches) return false;
  return doc.fields.every((f) => !f.required || f.status === "accepted" || f.status === "confirmed");
}

/** The document that answers a need: one uploaded under the same label first,
 *  then any document of the same type (an invoice uploaded at step 25 serves
 *  step 41). `stepNum` restricts it to one step - for a step's own output. */
export function documentFor(ledger: Ledger, label: string, docType: DocType | null, stepNum?: number): DocumentRecord | null {
  const scoped = stepNum == null ? ledger.documents : ledger.documents.filter((d) => d.stepNum === stepNum);
  const key = labelKey(label);
  const same = scoped.filter((d) => labelKey(d.label) === key);
  const pool = same.length ? same : docType ? scoped.filter((d) => d.docType === docType) : [];
  if (!pool.length) return null;
  return [...pool].reverse().find(documentComplete) ?? pool[pool.length - 1];
}
