/* Reading documents, scored against the values they were rendered from.
 *
 * The demo packs are genuine gold: `modules/demo/data/scenario-<id>.json` holds
 * the field values, and `public/demo/<id>/*.png` are the pages generated from
 * exactly those values. So a page read back must return what went in.
 *
 * The reader under test is whatever the environment configures - the Groq
 * vision model when a key is set. Free-tier token windows are small, so this
 * runs one document at a time and stops at `--limit` (default 6).
 */
import { readFileSync } from "node:fs";
import { composeDocument } from "../../modules/documents/docai/compose";
import { parseWithGroqVision } from "../../modules/documents/docai/groq-vision";
import { specFor, type DocType } from "../../modules/documents/specs";
import type { CaseResult, RunOptions, Suite } from "../types";

type Scenario = {
  procedureId: string;
  documents: { file: string; title: string; docType: DocType | null; fields: Record<string, string> }[];
};

/** One document per type, across the scenarios, so a run covers different
 *  layouts rather than six invoices. */
function sample(limit: number): { procedureId: string; file: string; title: string; docType: DocType; gold: Record<string, string> }[] {
  const ids = ["868", "325", "477", "57", "707", "161", "540", "306"];
  const picked: ReturnType<typeof sample> = [];
  const seenTypes = new Set<string>();

  for (const procedureId of ids) {
    let scenario: Scenario;
    try {
      scenario = JSON.parse(readFileSync(`modules/demo/data/scenario-${procedureId}.json`, "utf8")) as Scenario;
    } catch {
      continue;
    }
    for (const doc of scenario.documents) {
      if (!doc.docType || seenTypes.has(doc.docType) || picked.length >= limit) continue;
      const spec = specFor(doc.docType);
      const parsed = new Set(spec.fields.filter((f) => f.questions.length || f.anchors.length).map((f) => f.key));
      const gold = Object.fromEntries(Object.entries(doc.fields).filter(([k]) => parsed.has(k)));
      if (Object.keys(gold).length < 3) continue; // too little to score
      seenTypes.add(doc.docType);
      picked.push({ procedureId, file: `public/demo/${procedureId}/${doc.file}`, title: doc.title, docType: doc.docType, gold });
    }
  }
  return picked;
}

/* Cyrillic letters drawn identically to Latin ones. A page printed "ООО" and a
   gold value typed "OOO" are the same word; scoring them apart would measure
   the eval's alphabet rather than the model's reading. */
const HOMOGLYPHS: Record<string, string> = {
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x",
};

/** Gold and read value agree when one contains the other, compared on what
 *  survives OCR: case, spacing, punctuation and alphabet. */
const flat = (v: string) =>
  v
    .toLowerCase()
    .replace(/[Ѐ-ӿ]/g, (c) => HOMOGLYPHS[c] ?? c)
    .replace(/[^a-z0-9Ѐ-ӿ]+/g, "");
function agrees(read: string | null, gold: string): boolean {
  if (!read) return false;
  const a = flat(read);
  const b = flat(gold.split(",")[0]);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

export const documentsSuite: Suite = {
  name: "documents",
  about: "Demo pages read back by the configured model, scored field by field against the values they were rendered from.",
  needsModel: true,
  // A generous page returns everything; a dense or handwritten one will not.
  threshold: 0.8,
  async run({ limit }: RunOptions): Promise<CaseResult[]> {
    const key = process.env.GROQ_API_KEY!;
    const results: CaseResult[] = [];
    /* A free tier reads about one page a minute. Waiting between documents
       measures how well pages are read; running them back to back would only
       measure the rate limit. EVAL_DOC_PACE_MS=0 turns it off on a paid key. */
    const pace = Number(process.env.EVAL_DOC_PACE_MS ?? 62_000);
    let first = true;

    for (const doc of sample(limit ?? 6)) {
      if (!first && pace > 0) await new Promise((resolve) => setTimeout(resolve, pace));
      first = false;
      const buffer = readFileSync(doc.file);
      const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
      const spec = specFor(doc.docType);
      try {
        const response = await parseWithGroqVision(
          { bytes, fileName: doc.file.split("/").pop()!, contentType: "image/png", spec },
          { apiKey: key, model: process.env.GROQ_VISION_MODEL },
        );
        const document = composeDocument(spec, response);
        const read = new Map(document.fields.map((f) => [f.key, f.value]));

        const graded = Object.entries(doc.gold).map(([field, gold]) => ({ field, gold, ok: agrees(read.get(field) ?? null, gold) }));
        const right = graded.filter((g) => g.ok).length;
        const wrong = graded.filter((g) => !g.ok).map((g) => `${g.field} (wanted "${g.gold.slice(0, 22)}", read "${(read.get(g.field) ?? "—").slice(0, 22)}")`);

        results.push({
          id: `${doc.procedureId} ${doc.docType}`,
          // Per document: most of its fields must come back right.
          ok: right / graded.length >= 0.75,
          detail: `${right}/${graded.length} fields${wrong.length ? ` — missed ${wrong.slice(0, 3).join(", ")}` : ""}`,
        });
      } catch (error) {
        results.push({ id: `${doc.procedureId} ${doc.docType}`, ok: false, detail: (error as Error).message.slice(0, 120) });
      }
    }

    return results;
  },
};
