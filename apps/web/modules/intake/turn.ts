/* One intake turn for a message: the rules read it, and a message they can't
 * read (another language, typos) is read by a model and restated for them. */

import type { LlmClient } from "../ai/llm";
import { converse, type IntakeTurn } from "./conversation";
import { mergeReply, type IntakeDraft, type Slot } from "./draft";
import { needsModel, understandWithModel } from "./llm-extract";

export async function intakeTurn(draft: IntakeDraft, message: string, expecting: Slot | null, llm: LlmClient | undefined): Promise<IntakeTurn> {
  const turn = converse(draft, message, { expecting });
  if (needsModel(message, mergeReply(draft, message, expecting).understood, turn.status === "declined")) {
    const read = await understandWithModel(message, expecting, llm);
    if (read) {
      const retry = converse(draft, read.text, { expecting });
      if (retry.status !== "declined") return { ...retry, notes: [`Read your message as “${read.text}”`, ...retry.notes] };
    }
  }
  return turn;
}
