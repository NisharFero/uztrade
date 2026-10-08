/* One intake turn for a message: the rules read it, a message they can't read
 * (another language, typos) is read by a model and restated for them, and goods
 * no published category names are reasoned about rather than refused. */

import type { LlmClient } from "../ai/llm";
import { converse, evaluate, type IntakeTurn } from "./conversation";
import { mergeReply, type IntakeDraft, type Slot } from "./draft";
import { needsModel, understandWithModel } from "./llm-extract";
import { nearestCategory, proposalQuestion } from "./nearest";
import { CATEGORIES, CATEGORY_LABEL } from "./taxonomy";
import { procedureTitleCandidates } from "./reference";
import { CATALOGUE } from "../procedures/data/procedures.generated";

const YES = /^\s*(y|yes|yep|yeah|ok(ay)?|sure|go ahead|do it|use it|correct|that'?s right)[.!\s]*$/i;
const NO = /^\s*(n|no|nope|not really|something else|another)[.!\s]*$/i;

/** "yes" or "no" to the goods intake proposed ("Did you mean banana, published
 *  under fresh fruits and vegetables?"). The router reads this before any
 *  model does, so a bare "yes" never leaves the conversation it answers. */
export const answersProposal = (draft: IntakeDraft, message: string): boolean => Boolean(draft.proposal) && (YES.test(message) || NO.test(message));

/** Words that could name goods: worth asking a model about, unlike "hello". */
const NAMES_SOMETHING = /[a-zЀ-ӿ]{3,}/i;

export async function intakeTurn(
  draft: IntakeDraft,
  message: string,
  expecting: Slot | null,
  llm: LlmClient | undefined,
): Promise<IntakeTurn> {
  const choices = procedureTitleCandidates(message);
  if (choices.length > 1) return {
    status: "asking", draft, slot: "commodity", notes: [], progress: [],
    message: "Several published procedures have that title. Select the procedure ID so I follow the right steps.",
    options: choices.map((id) => ({ label: `${CATALOGUE[id].title} (${id}, ${CATALOGUE[id].stepsCount} steps)`, reply: `Start procedure ${id}` })),
  };
  // A proposal on the table is answered before anything else is read.
  if (draft.proposal) {
    const p = draft.proposal;
    if (YES.test(message)) {
      const accepted: IntakeDraft = {
        ...draft,
        commodity: { term: p.term, category: p.category, hs: p.hs },
        proposal: null,
      };
      const turn = evaluate(accepted);
      return { ...turn, notes: [`${cap(p.term)} opened under the published ${p.category} procedure.`, ...turn.notes] };
    }
    if (NO.test(message)) {
      const turn = converse({ ...draft, proposal: null }, "", { expecting: "commodity" });
      return { ...turn, notes: ["Not that one, then.", ...turn.notes] };
    }
    // Anything else is read as a fresh answer, with the proposal dropped.
    draft = { ...draft, proposal: null };
  }

  const turn = converse(draft, message, { expecting });
  // Unknown locations are a data gap, not text for a model to reinterpret.
  if (mergeReply(draft, message, expecting).unknownPlace) return turn;
  if (needsModel(message, mergeReply(draft, message, expecting).understood, turn.status === "declined")) {
    const read = await understandWithModel(message, expecting, llm);
    if (read) {
      const retry = converse(draft, read.text, { expecting });
      if (retry.status !== "declined") return { ...retry, notes: [`Read your message as “${read.text}”`, ...retry.notes] };
    }
  }

  // Still no goods, and the trader did name something: reason about what it is
  // rather than listing what it isn't.
  const stillAsking = turn.status !== "confirm" && turn.slot === "commodity" && !turn.draft.commodity;
  if (stillAsking && NAMES_SOMETHING.test(message)) {
    const result = await nearestCategory(message, llm);

    if (result?.kind === "proposal") {
      const proposal = { term: result.term, category: result.category, hs: result.hs, reason: result.reason };
      return {
        ...turn,
        draft: { ...turn.draft, proposal },
        slot: "commodity",
        message: proposalQuestion(proposal),
        options: [
          { label: `Yes — ${proposal.term} as ${CATEGORY_LABEL[proposal.category] ?? proposal.category}`, reply: "yes" },
          { label: "No, something else", reply: "no" },
        ],
        notes: [`No procedure is published for ${proposal.term} by name; ${CATEGORIES.length} categories are published.`],
      };
    }

    // Nothing published covers the goods. Say which goods, rather than asking
    // the same question again as though it had not been answered.
    if (result?.kind === "none") {
      return {
        ...turn,
        message: `No published procedure covers ${result.product}. Here is what is published — name one of these, or a different product.`,
        notes: [],
      };
    }
  }

  return turn;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
