/* "wagon 5 loaded, seals 88421, invoice 17 sent" - one line from the trader,
 * read into the things the open steps are actually waiting for.
 *
 * The model may only choose among the labels it is given and repeat a value
 * from the note; anything else is reported as not understood. Nothing is
 * recorded here: the proposals go back to the trader, who applies the ones
 * that are right, and each then travels the normal value/confirm path. */

import { z } from "zod";
import { llmJson, type LlmClient } from "../ai/llm";
import type { Need } from "./next";

export type NoteProposal = { needId: string; stepNum: number; label: string; kind: "value" | "confirm"; value: string; why: string };
export type NoteReading = { proposals: NoteProposal[]; unmatched: string[]; model: string | null };

export type OpenStep = { stepNum: number; title: string; needs: Need[] };

const Read = z.object({
  items: z
    .array(z.object({ label: z.string(), value: z.string(), quote: z.string().nullish() }))
    .max(12)
    .default([]),
  unmatched: z.array(z.string()).max(6).default([]),
});

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const YES = /^(yes|y|done|ok|okay|complete[d]?|true|ha|да|ha'?a)$/i;

/** What the note says about the open steps' needs; empty when no model is available. */
export async function readNote(note: string, open: OpenStep[], llm?: LlmClient): Promise<NoteReading> {
  const wanted = open.flatMap((step) =>
    step.needs
      .filter((need) => (need.kind === "value" || need.kind === "confirm") && need.status !== "have")
      .map((need) => ({ step, need })),
  );
  if (!note.trim() || !wanted.length) return { proposals: [], unmatched: [], model: null };

  const answer = await llmJson(llm, {
    sensitivity: "public",
    system: [
      "A trader sends a short note about a shipment in progress. Match what it says to the listed items, which are the only ones you may use.",
      "Use the label exactly as given. value: the value from the note, copied as written; for a confirmation use yes or no.",
      "Quote the words of the note you took it from. Leave out anything the note doesn't state, and list what you could not place in unmatched.",
      'JSON: {"items": [{"label": "...", "value": "...", "quote": "..."}], "unmatched": ["..."]}',
    ].join("\n"),
    prompt: JSON.stringify({
      note,
      items: wanted.map(({ step, need }) => ({ label: need.label, kind: need.kind, step: step.stepNum, about: need.detail.slice(0, 120) })),
    }),
    schema: Read,
    maxTokens: 900,
  });
  if (!answer) return { proposals: [], unmatched: [], model: null };

  const noteText = squash(note);
  const byLabel = new Map(wanted.map(({ step, need }) => [squash(need.label), { step, need }]));
  const proposals: NoteProposal[] = [];
  const unmatched = [...answer.data.unmatched];

  for (const item of answer.data.items) {
    const hit = byLabel.get(squash(item.label));
    const value = item.value?.trim();
    if (!hit || !value) {
      if (item.label) unmatched.push(`${item.label}: ${item.value ?? ""}`.trim());
      continue;
    }
    // The value has to be in the note - the model reads, it doesn't supply.
    if (hit.need.kind === "value" && !noteText.includes(squash(value))) {
      unmatched.push(`${item.label}: “${value}” isn't in your note`);
      continue;
    }
    if (hit.need.kind === "confirm" && !YES.test(value)) continue;
    if (proposals.some((p) => p.needId === hit.need.id)) continue;
    proposals.push({
      needId: hit.need.id,
      stepNum: hit.step.stepNum,
      label: hit.need.label,
      kind: hit.need.kind === "confirm" ? "confirm" : "value",
      value: hit.need.kind === "confirm" ? "yes" : value,
      why: item.quote?.trim() ? `from “${item.quote.trim()}”` : `step ${hit.step.stepNum}`,
    });
  }

  return { proposals, unmatched: [...new Set(unmatched)].slice(0, 6), model: answer.model };
}
