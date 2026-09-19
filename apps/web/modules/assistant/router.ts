/* The chat's first move: work out what the message is asking before anything
 * answers it.
 *
 *   shipment   a shipment to open, or an answer to the intake question that
 *              is waiting ("20 tonnes", "to Almaty")
 *   cases      the trader's own cases and shipments - which are active, what
 *              one is waiting on, how far along it is
 *   knowledge  the published procedures and how UzTrade works - what a
 *              step needs, who issues a certificate, which goods are covered
 *   other      anything else
 *
 * The wording alone is often misleading: "which shipments are supported?" is
 * about the procedures, "which shipments are active?" is about the trader's
 * cases, and "what documents do I need?" in the middle of intake is still a
 * question, not an answer. So a model reasons about the message first - with
 * the intake question that is waiting and the case references it could mean -
 * and names the intent. Rules decide only the unambiguous messages (a case
 * reference, a plain answer to the waiting question) and stand in when no model
 * is available. Case ids the model names must be real ones. */

import { z } from "zod";
import { llmJson, type LlmClient } from "../ai/llm";
import { isEmptyDraft, mergeReply, type IntakeDraft, type Slot } from "../intake/draft";
import { isProcedureQuestion, isTradeQuery } from "../intake/relevance";
import { commodityOf } from "../intake/taxonomy";
import { PROCEDURE_IDS, CATALOGUE as PROCEDURE_CATALOGUE } from "../procedures/data/procedures.generated";

const CATALOGUE = PROCEDURE_IDS.map((id) => PROCEDURE_CATALOGUE[id].title.toLowerCase()).join("; ");

export type Intent = "shipment" | "cases" | "knowledge" | "other";
export type CaseFilter = "active" | "complete" | "any";

export type CaseRef = { id: string; title: string; status: string };

export type RouteContext = {
  draft: IntakeDraft;
  /** The intake question waiting for an answer, if any. */
  expecting: Slot | null;
  /** The trader's cases, newest first - so "my tea shipment" can be resolved. */
  cases: CaseRef[];
};

export type Routed = {
  intent: Intent;
  /** One or two sentences on why - shown to the trader. */
  reasoning: string;
  /** Cases the message is about; empty means "the cases the filter selects". */
  caseIds: string[];
  filter: CaseFilter;
  by: "model" | "rules";
  model: string | null;
};

const SLOT_QUESTION: Record<Slot, string> = {
  commodity: "what goods are moving",
  direction: "export from or import into Uzbekistan",
  mode: "how the goods travel (train, air)",
  quantity: "how much",
  route: "from where to where",
};

export const CASE_REF = /\bUZ-\d{4}-\d{4}\b/i;
const CASE_REFS = /\bUZ-\d{4}-\d{4}\b/gi;

const QUESTION = /\?\s*$|^\s*(what|which|how|when|where|who|why|can|could|should|do|does|did|is|are|has|have|will|tell me|show me|list)\b/i;
const MINE = /\b(my|our|mine|ours)\b[^.?!]{0,40}\b(cases?|shipments?|consignments?|orders?)\b/i;
const CASE_STATE =
  /\b(cases?|shipments?|consignments?)\b[^.?!]{0,30}\b(status|progress|active|open|opened|running|ongoing|in progress|current(ly)?|stuck|blocked|pending|waiting|finished|complete[d]?|so far|now)\b/i;
const STATE_CASE = /\b(active|open|ongoing|running|current|existing|pending|blocked|stuck|finished|completed|recent|latest)\s+(cases?|shipments?|consignments?)\b/i;
const HOW_MANY = /\bhow many\b[^.?!]{0,20}\b(cases?|shipments?)\b/i;
const SHIPMENT_REQUEST =
  /\b(i|we)\s+(want|need|plan|would like|am going|are going|am trying|are trying)\s+to\s+(export|import|ship|send|move|transport|bring)\b|^\s*(export|import|ship|send|move|transport)\b/i;

const completeWord = /\b(finished|complete[d]?|done|closed)\b/i;
const activeWord = /\b(active|open|ongoing|running|current(ly)?|in progress|pending|blocked|stuck|waiting)\b/i;

export function caseRefsIn(message: string, cases: CaseRef[]): string[] {
  const known = new Map(cases.map((c) => [c.id.toUpperCase(), c.id]));
  return [...new Set((message.match(CASE_REFS) ?? []).map((m) => known.get(m.toUpperCase())).filter((id): id is string => Boolean(id)))];
}

export function filterIn(message: string): CaseFilter {
  if (completeWord.test(message) && !activeWord.test(message)) return "complete";
  if (activeWord.test(message)) return "active";
  return "any";
}

export function looksLikeCases(message: string): boolean {
  return CASE_REF.test(message) || MINE.test(message) || CASE_STATE.test(message) || STATE_CASE.test(message) || HOW_MANY.test(message);
}

const routed = (intent: Intent, reasoning: string, message: string, context: RouteContext, extra: Partial<Routed> = {}): Routed => ({
  intent,
  reasoning,
  caseIds: intent === "cases" ? caseRefsIn(message, context.cases) : [],
  filter: intent === "cases" ? filterIn(message) : "any",
  by: "rules",
  model: null,
  ...extra,
});

/** Messages whose intent the words settle on their own - no model needed. */
export function obviousRoute(message: string, context: RouteContext): Routed | null {
  if (caseRefsIn(message, context.cases).length) {
    return routed("cases", "The message names one of your cases.", message, context);
  }
  // A plain answer to the question intake is waiting on ("20 tonnes", "by train").
  if (context.expecting && !QUESTION.test(message) && mergeReply(context.draft, message, context.expecting).understood) {
    return routed("shipment", `An answer to the waiting question: ${SLOT_QUESTION[context.expecting]}.`, message, context);
  }
  // "I want to export tomatoes" is a new shipment, even when a tomato case already exists -
  // the model once read it as "show my tomato case" and answered with that case's quantity and route.
  if (SHIPMENT_REQUEST.test(message) && !QUESTION.test(message) && !MINE.test(message)) {
    return routed("shipment", "You want to move goods — a new shipment, so I'll ask for the details.", message, context);
  }
  return null;
}

/** The rules' best reading, for when no model is available. */
export function routeByRules(message: string, context: RouteContext): Routed {
  const obvious = obviousRoute(message, context);
  if (obvious) return obvious;
  if (SHIPMENT_REQUEST.test(message) && !QUESTION.test(message)) return routed("shipment", "It describes goods you want to move.", message, context);
  if (looksLikeCases(message)) return routed("cases", "It asks about your own cases or shipments.", message, context);
  if (isProcedureQuestion(message) || (QUESTION.test(message) && isTradeQuery(message))) {
    return routed("knowledge", "It's a question about the procedures, not a shipment to open.", message, context);
  }
  const drafting = !isEmptyDraft(context.draft);
  if (commodityOf(message).kind !== "none" || isTradeQuery(message) || (drafting && !QUESTION.test(message))) {
    return routed("shipment", "It reads as shipment details.", message, context);
  }
  if (QUESTION.test(message)) return routed("knowledge", "A question - the published procedures and the FAQ may answer it.", message, context);
  return routed("other", "It isn't about a shipment, your cases, or the procedures.", message, context);
}

const Decision = z.object({
  reasoning: z.string().min(1).max(600),
  intent: z.enum(["shipment", "cases", "knowledge", "other"]),
  caseIds: z.array(z.string()).max(20).nullish(),
  filter: z.enum(["active", "complete", "any"]).nullish(),
});

const SYSTEM = [
  `You are the router of UzTrade, a workspace where a trader opens cases for moving goods into or out of Uzbekistan under ${PROCEDURE_IDS.length} published procedures (${CATALOGUE}).`,
  "Decide what the trader's message asks for. Think about what they actually want before choosing; the same words can mean different things.",
  "Intents:",
  '- "shipment": they describe goods they want to move or ask to arrange rail transport or delivery of cargo, or answer the intake question that is waiting (a quantity, a place, a mode, fresh or dried, export or import, dispatch or delivery).',
  '- "cases": they ask about THEIR OWN cases or shipments already in the workspace - which are active or finished, how many, the status or progress of one, what one is waiting on, its next step, what it still needs.',
  '- "knowledge": they ask how the published procedures work in general (documents, steps, who issues what, durations, countries, which goods are covered) or how UzTrade works.',
  '- "other": anything else (greetings, weather, unrelated topics).',
  "Contrasts:",
  '"I want to export tomatoes" -> shipment, even if a tomato case already exists (they are starting a new one). "How is my tomato shipment doing?" -> cases.',
  '"Which shipments are supported?" -> knowledge. "Which shipments are currently active?" -> cases, filter active.',
  '"What documents do I need to export tea?" -> knowledge. "What documents does my tea shipment still need?" -> cases.',
  '"How long does tea export by train take?" -> knowledge. "How long until my case is done?" -> cases.',
  '"Export 20 tonnes of tea to Almaty" -> shipment. "20 tonnes" while intake asks how much -> shipment.',
  '"What do I need for the phytosanitary certificate?" while intake asks how much -> knowledge (a question, not an answer).',
  "caseIds: ids from the given case list the message refers to (by id, goods, route or title); [] when it means cases in general.",
  'filter: "active" for current/open/ongoing/pending cases, "complete" for finished ones, otherwise "any".',
  "reasoning: one or two plain sentences saying what they are asking, addressed to nobody in particular.",
  "JSON keys: reasoning, intent, caseIds, filter.",
].join("\n");

export async function routeMessage(message: string, context: RouteContext, llm: LlmClient | undefined): Promise<Routed> {
  const obvious = obviousRoute(message, context);
  if (obvious) return obvious;

  const answer = await llmJson(llm, {
    // The message, the intake question and case titles all come from what the trader typed.
    sensitivity: "public",
    system: SYSTEM,
    prompt: JSON.stringify({
      message,
      intakeInProgress: !isEmptyDraft(context.draft),
      waitingQuestion: context.expecting ? SLOT_QUESTION[context.expecting] : null,
      cases: context.cases.slice(0, 20).map((c) => ({ id: c.id, title: c.title, status: c.status })),
    }),
    schema: Decision,
    maxTokens: 700,
  });
  if (!answer) return routeByRules(message, context);

  const { data } = answer;
  const known = new Map(context.cases.map((c) => [c.id.toUpperCase(), c.id]));
  const named = (data.caseIds ?? []).map((id) => known.get(id.trim().toUpperCase())).filter((id): id is string => Boolean(id));
  return {
    intent: data.intent,
    reasoning: data.reasoning.trim(),
    caseIds: data.intent === "cases" ? [...new Set([...caseRefsIn(message, context.cases), ...named])] : [],
    filter: data.intent === "cases" ? (data.filter ?? filterIn(message)) : "any",
    by: "model",
    model: answer.model,
  };
}
