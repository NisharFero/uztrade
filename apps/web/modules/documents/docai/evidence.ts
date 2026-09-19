/* Where a field's value was found, in words the trader can check against the
 * page: which reader produced it, what it was asked or which printed label it
 * sat next to, on which page, and which other readings agreed.
 *
 * Fields keep the reader in `source` ("layoutlm", "anchor-right", "demo-pack",
 * "trader", "anchor-inline+reread:<model>") and the details in `evidence`.
 * Documents stored before `evidence` existed are described from `source`. */

export type FieldEvidence = {
  /** The question the layout model answered. */
  question?: string;
  /** The printed label the value was read next to, as a readable phrase. */
  label?: string;
  /** 1-based page number. */
  page?: number;
  /** Other readers that read the same value. */
  agreed?: string[];
};

export type EvidenceView = { method: string; detail: string; page: number | null; agreed: string[] };

const READER: Record<string, string> = {
  layoutlm: "Layout model",
  "anchor-inline": "Printed label",
  "anchor-right": "Printed label",
  "anchor-below": "Printed label",
  "demo-pack": "Demo pack",
  "deterministic-fallback": "Demo pack",
  "text-layer": "Text of the file",
  trader: "You",
};

export const readerName = (source: string) => READER[source.split("+")[0]] ?? READER[source.split("-")[0]] ?? source;

/** A label-anchor regular expression as the words it matches: "масса\\s*\\(в кг\\)" -> "масса (в кг)". */
export function readableAnchor(pattern: string): string {
  return pattern
    .replace(/\\s[*+]?/g, " ")
    .replace(/\\([().?*+[\]])/g, "$1")
    .replace(/\[([^\]])[^\]]*\]/g, "$1")
    .replace(/\(\?:?/g, "(")
    .replace(/[\^$]/g, "")
    .replace(/'\?/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function describeEvidence(field: { source: string | null; evidence?: FieldEvidence | null; status: string; value: string | null }): EvidenceView {
  const source = field.source ?? "";
  const ev = field.evidence ?? {};
  const page = ev.page ?? null;
  const agreed = (ev.agreed ?? []).map(readerName).filter((name, i, all) => all.indexOf(name) === i);
  if (!field.value) return { method: "Not found", detail: "no reading of this field", page: null, agreed: [] };

  const [first, ...rest] = source.split("+");
  const reread = rest.find((r) => r.startsWith("reread:"));
  const second = reread ? `; a second reading by ${reread.slice("reread:".length)} agreed` : "";
  const quote = (s: string) => `“${s}”`;

  switch (first) {
    case "layoutlm":
      return { method: "Layout model", detail: `${ev.question ? `answered ${quote(ev.question)}` : "answered the field's question on the page"}${second}`, page, agreed };
    case "anchor-inline":
      return { method: "Printed label", detail: `on the same line as ${ev.label ? quote(ev.label) : "the field's label"}${second}`, page, agreed };
    case "anchor-right":
      return { method: "Printed label", detail: `to the right of ${ev.label ? quote(ev.label) : "the field's label"}${second}`, page, agreed };
    case "anchor-below":
      return { method: "Printed label", detail: `below ${ev.label ? quote(ev.label) : "the field's label"}${second}`, page, agreed };
    case "demo-pack":
    case "deterministic-fallback":
      // The document's header says once that the document AI wasn't running.
      return { method: "Demo pack", detail: `printed${ev.label ? ` under ${quote(ev.label)}` : ""} on this demo page — taken from the pack's own record`, page, agreed };
    case "text-layer":
      return { method: "Text of the file", detail: `the line after ${ev.label ? quote(ev.label) : "the field's label"}`, page, agreed };
    case "trader":
      return { method: "You", detail: field.status === "confirmed" ? "typed and confirmed by you" : "typed by you", page: null, agreed: [] };
    default:
      if (first.startsWith("reread:")) return { method: "Second reading", detail: `read from the page text by ${first.slice("reread:".length)} — confirm it`, page, agreed };
      return { method: readerName(first), detail: first, page, agreed };
  }
}
