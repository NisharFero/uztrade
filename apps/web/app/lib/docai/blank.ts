/* When a document can't be read automatically (service down, unreadable
 * scan), the trader still gets the document's field list to fill in by hand. */

import type { DocSpec } from "../document-specs";
import type { ExtractedField } from "./compose";

export function blankFields(spec: DocSpec): ExtractedField[] {
  return spec.fields
    .filter((f) => f.questions.length || f.anchors.length)
    .map((f) => ({
      key: f.key,
      label: f.name,
      kind: f.kind,
      required: f.required,
      value: null,
      normalized: null,
      confidence: 0,
      status: "missing" as const,
      source: null,
      alternatives: [],
    }));
}
