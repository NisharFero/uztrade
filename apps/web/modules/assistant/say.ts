/* The assistant's answer, as something to read.
 *
 * Every kind of result the chat produces arrives here as data and leaves as
 * sentences. The chat streams those sentences a few words at a time, so a
 * reply reads like an assistant talking rather than a filled-in card.
 */

import type { CasesAnswer } from "./cases";
import type { ChatResult, ShipmentNeeds } from "./chat";
import type { Estimate, EstimateOption, Overview } from "./intention";
import type { FaqAnswer } from "../faq/answer";
import type { IntakeTurn } from "../intake/conversation";
import { CATALOGUE } from "../procedures/data/procedures.generated";
import { inSentence } from "../shared/text";

export type ReplyActions = {
  confirm?: { title: string; procedureId: string; steps: number };
  caseId?: string;
  options?: { label: string; text: string }[];
};

export type Spoken = { text: string; actions: ReplyActions };

const join = (lines: (string | null | undefined)[]): string => lines.filter((l): l is string => Boolean(l && l.trim())).join("\n\n");

const hours = (range: [number, number]): string => {
  const days = range[1] >= 48;
  const value = (n: number) => (days ? Math.round(n / 24) : Math.round(n));
  const unit = days ? "days" : "hours";
  const low = value(range[0]);
  const high = value(range[1]);
  return low === high ? `${high} ${unit}` : `${low}–${high} ${unit}`;
};

const withoutMarkers = (answer: string) => answer.replace(/\s*\[\d+\]/g, "").replace(/\s+([.,;])/g, "$1");
const lowerFirst = (s: string) => (s ? `${s.charAt(0).toLowerCase()}${s.slice(1)}` : s);

/** Names a list the way a person would: "a, b and c", or "a, b, c and 4 more". */
const listed = (items: string[], show = 4): string => {
  const named = items.slice(0, show).map((i) => inSentence(i));
  const rest = items.length - named.length;
  if (rest > 0) return `${named.join(", ")} and ${rest} more`;
  if (named.length <= 1) return named[0] ?? "";
  return `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
};

/* ------------------------------------------------------ time, in words --- */

const DIRECTION_NOUN: Record<string, string> = { export: "an export", import: "an import" };
const cap = (s: string) => (s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}` : s);
const km = (n: number) => `${(Math.round(n / 10) * 10).toLocaleString("en-US")} km`;
const way = (o: EstimateOption) => `${o.direction} by ${o.mode}`;
/** Only worth saying when it reads differently from the published time. */
const faster = (o: EstimateOption) => o.paperwork[1] < o.published[1] && hours(o.paperwork) !== hours(o.published);

/** One line for a procedure in a list: how it is published, and with the agents. */
const optionLine = (o: EstimateOption) =>
  `• ${cap(way(o))} — ${o.steps} steps, usually ${hours(o.published)}${faster(o) ? ` (about ${hours(o.paperwork)} with the agents on it)` : ""}`;

function sayEstimate(e: Estimate): Spoken {
  const route = e.from && e.to ? ` from ${e.from} to ${e.to}` : "";
  const assumed = e.assumed.length ? `That assumes ${listed(e.assumed, 3)}.` : null;

  if (e.unpublished) {
    const { direction, mode } = e.unpublished;
    const asked = `${direction ? `${direction === "export" ? "exporting" : "importing"} ` : ""}${e.goods}${mode ? ` by ${mode}` : ""}`;
    return {
      text: join([
        `There's no published procedure for ${asked}, so I can't give you a time for that. These are the ways that are published:`,
        e.options.map(optionLine).join("\n"),
        "Tell me which of these fits and I'll estimate it with the route.",
      ]),
      actions: {},
    };
  }

  if (e.options.length === 1) {
    const o = e.options[0];
    const opening = `Moving ${e.goods} by ${o.mode}${route} is ${DIRECTION_NOUN[o.direction]}, under the published procedure “${o.title}” (${o.steps} steps).`;
    const paperwork =
      `The paperwork usually takes ${hours(o.published)} end to end.` +
      (faster(o) ? ` With the agents filing the online steps and the independent steps run side by side, it comes to about ${hours(o.paperwork)}.` : "");
    const journey =
      o.transit && o.doorToDoor
        ? `The ${o.mode === "air" ? "flight" : o.mode === "road" ? "drive" : "train"} itself takes about ${hours(o.transit)}` +
          `${o.distanceKm ? ` for roughly ${km(o.distanceKm)}` : ""}` +
          `${o.borders ? `, with ${o.borders} border crossing${o.borders === 1 ? "" : "s"}` : ""}` +
          ` — so about ${hours(o.doorToDoor)} door to door.`
        : "Tell me where it leaves from and where it goes, and I'll add the journey itself.";
    return {
      text: join([opening, paperwork, journey, assumed, "Nothing is opened. If you want to go ahead, tell me how much you're sending and I'll plan it with you."]),
      actions: {},
    };
  }

  const lines = e.options.map(optionLine).join("\n");
  const journeys = e.options.filter((o) => o.transit);
  const journey = journeys.length
    ? `On the way${route}: ${journeys.map((o) => `about ${hours(o.transit!)} by ${o.mode}`).join(", ")}.`
    : null;
  const narrow = [
    e.missing.includes("direction") ? "whether you're exporting or importing" : null,
    e.missing.includes("mode") ? "how it travels" : null,
    e.missing.includes("route") ? "where from and where to" : null,
  ].filter((x): x is string => Boolean(x));
  return {
    text: join([
      `Here's how long moving ${e.goods} takes under the published procedures:`,
      lines,
      journey,
      assumed,
      narrow.length ? `Tell me ${listed(narrow, 3)} and I'll give you one number.` : null,
    ]),
    actions: {},
  };
}

/** For someone finding out: what moving the goods involves, before any
 *  question - the published ways, how long each takes, and what the likeliest
 *  one will ask for. */
function sayOverview(o: Overview, turn: IntakeTurn): string {
  const ways =
    o.options.length === 1
      ? `${cap(o.options[0].direction === "export" ? "exporting" : "importing")} ${o.goods} by ${o.options[0].mode} follows the published procedure “${o.options[0].title}”: ${o.options[0].steps} steps, usually ${hours(o.options[0].published)} end to end` +
        `${faster(o.options[0]) ? `, or about ${hours(o.options[0].paperwork)} with me filing the online steps` : ""}.`
      : `${cap(o.goods)} can go ${o.options.length} ways under the published procedures:\n${o.options.map(optionLine).join("\n")}`;

  const needs = o.needs;
  const docs = needs?.documents ?? [];
  const details = needs?.details ?? [];
  const what =
    o.focus && (docs.length || details.length)
      ? `For ${o.options.length === 1 ? "it" : `${DIRECTION_NOUN[o.focus.direction]} by ${o.focus.mode}`}, you'll need ${[
          docs.length ? `${docs.length} document${docs.length === 1 ? "" : "s"} — ${listed(docs)}` : null,
          details.length ? `details such as ${listed(details, 2)}` : null,
        ]
          .filter(Boolean)
          .join(", and ")}. I'll ask for each one when its step comes up.`
      : null;

  const ask = turn.status === "asking" ? join(["Nothing is opened yet.", turn.message]) : turn.message;
  return join([`Here's what moving ${o.goods} involves.`, ways, what, ask]);
}

function sayIntake(turn: IntakeTurn, needs?: ShipmentNeeds, overview?: Overview): Spoken {
  const options = turn.options.map((o) => ({ label: o.label, text: o.reply }));

  if (turn.status === "declined") return { text: turn.message, actions: {} };

  if (turn.status === "confirm" && turn.summary) {
    const s = turn.summary;
    if (turn.draft.procedureId) return {
      text: join([turn.message, turn.draft.quantity ? `Load: ${s.howMuch}. Route: ${s.route}.` : null, "Shall I open the case and start with the first step?"]),
      actions: { confirm: { title: s.caseTitle, procedureId: s.procedureId, steps: s.steps }, options },
    };
    const timeframe = CATALOGUE[s.procedureId]?.timeframe;
    const route = s.route.replace(/,\s*[^,→]+(?=\s*(→|->|$))/g, "").replace(/\s*(->|→)\s*/g, " to ");
    const mode = s.how.toLowerCase().replace(/^by /, "");
    const [rawAmount, load] = s.howMuch.split(/\s+(?:is about|≈)\s+/);
    // "20 t" is how a table writes it; a sentence says tonnes.
    const amount = rawAmount.replace(/\b(\d[\d.,]*)\s*t\b/, (_, n: string) => `${n} ${n === "1" ? "tonne" : "tonnes"}`);
    const goods = lowerFirst(s.what.replace(/\s*\(HS[^)]*\)/, ""));

    const summary =
      `Here's the plan. You're ${s.direction === "import" ? "importing" : "exporting"} ${amount} of ${goods} from ${route} by ${mode}` +
      `${load ? `, which is about ${load}` : ""}.`;
    const procedure =
      `That follows the published procedure “${s.title}”: ${s.steps} steps` +
      `${timeframe ? `, usually ${hours(timeframe)} end to end` : ""}. ` +
      "I'll file the online parts with the entities myself and take you through the rest one step at a time.";

    const documents = needs?.documents ?? [];
    const details = needs?.details ?? [];
    const whatYouNeed =
      documents.length || details.length
        ? `Along the way you'll need ${[
            documents.length ? `${documents.length} document${documents.length === 1 ? "" : "s"} — ${listed(documents)}` : null,
            details.length ? `${details.length} detail${details.length === 1 ? "" : "s"} such as ${listed(details, 2)}` : null,
          ]
            .filter(Boolean)
            .join(", and ")}. ` +
          "You don't need them all now: I'll ask for each one when its step comes up, or you can send them early and I'll check them as they arrive."
        : null;

    return {
      text: join([summary, procedure, whatYouNeed, "Shall I open the case and start with the first step?"]),
      actions: { confirm: { title: s.caseTitle, procedureId: s.procedureId, steps: s.steps }, options },
    };
  }

  if (overview) return { text: sayOverview(overview, turn), actions: { options } };
  // One missing detail per message: the turn names the one it is asking for,
  // and a trader who says more at once has it all read anyway.
  return { text: join([turn.message, turn.notes.length ? turn.notes.join(" ") : null]), actions: { options } };
}

function sayCases(answer: CasesAnswer): Spoken {
  const unknown = answer.unknown.length ? `I have no case called ${answer.unknown.join(" or ")}.` : null;
  const only = answer.cases.length === 1 ? answer.cases[0] : null;
  return {
    text: join([unknown, answer.answer]),
    actions: { caseId: only?.id },
  };
}

function sayKnowledge(answer: FaqAnswer, faq: { question: string; answer: string[] }[]): Spoken {
  if (answer.found && answer.answer) {
    const sources = answer.sources.slice(0, 3).map((s) => s.title);
    return {
      text: join([withoutMarkers(answer.answer), sources.length ? `From ${sources.join("; ")}.` : null]),
      actions: {},
    };
  }

  const closest = answer.sources.slice(0, 3).map((s) => s.title);
  return {
    text: join([
      answer.withheld
        ? "I could not answer that from the published procedures without going beyond what they say, so I would rather not guess."
        : "The published procedures do not answer that directly.",
      closest.length ? `The closest they come is ${closest.join("; ")}.` : null,
      faq.length ? `You could also ask: ${faq.slice(0, 2).map((f) => `"${f.question}"`).join(" or ")}` : null,
    ]),
    actions: {},
  };
}

export function say(result: ChatResult): Spoken {
  switch (result.kind) {
    case "intake":
      return sayIntake(result.turn, result.needs, result.overview);
    case "estimate":
      return sayEstimate(result.estimate);
    case "cases":
      return sayCases(result.answer);
    case "knowledge":
      return sayKnowledge(result.answer, result.faq);
    case "other":
      return {
        text: join([result.message, result.suggestions.length ? `Try: ${result.suggestions.map((s) => `"${s}"`).join(", ")}` : null]),
        actions: {},
      };
  }
}

/** The first sentence, and only the first: "Two cases are active. UZ-…" -> "Two cases are active." */
const firstSentence = (text: string) => {
  // A summary may run straight into its list ("… on you. • Export of tea …").
  const flat = text.split(/\n|•/)[0].replace(/\s+/g, " ").trim();
  const end = flat.search(/(?<=[.!?])\s+(?=[A-Z“"])/);
  return end > 0 ? flat.slice(0, end) : flat;
};

/**
 * What the chat writes when the reply also carries a card.
 *
 * The card holds the figures - the ways, the times, the plan, the cases - so
 * the words only need to say what the card is and ask the one open question.
 * A trader should be able to read the reply at a glance and tap, not read
 * four paragraphs to find the question at the end.
 */
export function brief(result: ChatResult): Spoken {
  switch (result.kind) {
    case "intake": {
      const { turn, overview } = result;
      const options = turn.options.map((o) => ({ label: o.label, text: o.reply }));
      if (turn.status === "declined") return { text: turn.message, actions: {} };
      if (turn.status === "confirm" && turn.summary) {
        const s = turn.summary;
        return {
          text: "Here's the plan. Open the case when it looks right, or tell me what to change.",
          actions: { confirm: { title: s.caseTitle, procedureId: s.procedureId, steps: s.steps }, options },
        };
      }
      const ask = join([turn.message, turn.notes.length ? turn.notes.join(" ") : null]);
      if (overview?.options.length)
        return {
          text: join([`${cap(overview.goods)} can move ${overview.options.length === 1 ? "one published way" : `${overview.options.length} published ways`}. Nothing is opened yet.`, ask]),
          actions: { options },
        };
      return { text: ask, actions: { options } };
    }
    case "estimate": {
      const e = result.estimate;
      const route = e.from && e.to ? ` from ${e.from} to ${e.to}` : "";
      if (e.unpublished) return { text: `There's no published procedure for that way of moving ${e.goods}. These are the ways that are:`, actions: {} };
      if (e.options.length === 1) return { text: `Moving ${e.goods}${route}, under the published procedure:`, actions: {} };
      return { text: `${cap(e.goods)} can move ${e.options.length} ways${route}. Pick one and I'll plan it:`, actions: {} };
    }
    case "cases": {
      const { answer } = result;
      const unknown = answer.unknown.length ? `I have no case called ${answer.unknown.join(" or ")}.` : null;
      const only = answer.cases.length === 1 ? answer.cases[0] : null;
      // The cards show each case's state; the words keep the answer's point.
      return { text: join([unknown, answer.cases.length ? firstSentence(answer.answer) : answer.answer]), actions: { caseId: only?.id } };
    }
    case "knowledge":
      // The answer is the content: it stays. Its sources become chips.
      if (result.answer.found && result.answer.answer) return { text: withoutMarkers(result.answer.answer), actions: {} };
      return say(result);
    case "other":
      return { text: result.message, actions: {} };
  }
}

export function sayOpened(input: { caseId: string; title: string; planSummary: string }): Spoken {
  return {
    text: join([
      `Done - ${input.title} is open as case ${input.caseId}.`,
      input.planSummary,
      "I will take you through it one step at a time. Ask me what it is waiting on whenever you like.",
    ]),
    actions: { caseId: input.caseId },
  };
}

export function chunksOf(text: string, wordsPerChunk = 3): string[] {
  const chunks: string[] = [];
  for (const paragraph of text.split(/(\n\n)/)) {
    if (paragraph === "\n\n") {
      chunks.push(paragraph);
      continue;
    }
    const words = paragraph.split(/(\s+)/).filter(Boolean);
    for (let i = 0; i < words.length; i += wordsPerChunk * 2) {
      chunks.push(words.slice(i, i + wordsPerChunk * 2).join(""));
    }
  }
  return chunks.filter(Boolean);
}
