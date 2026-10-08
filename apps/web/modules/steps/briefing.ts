/* A step, said in plain English.
 *
 * The case workspace used to render a step as a stack of cards: a lane badge,
 * an entity chip, a needs table, a channel switch. Everything was on screen and
 * nothing said what to do. This turns the same step into the two sentences a
 * person actually wants - what to do now, and why it matters - followed by the
 * short list of what is still missing.
 *
 * It writes prose, not markup, so the chat can stream it a word at a time the
 * way an assistant answers. Nothing here decides anything: the step, its lane
 * and its needs are settled by modules/steps/next.ts, and this only says them.
 */

import type { StepView, Need } from "./next";
import type { AssistantView } from "./assistant";
import { actorOfStep } from "../procedures/actors";
import { inSentence } from "../shared/text";

export type Briefing = {
  /** One line naming the step, for the chat's heading. */
  headline: string;
  /** What to do now, and why - the part that gets streamed. */
  paragraphs: string[];
  /** What is still needed, one line each, in the order they are asked for. */
  missing: { id: string; label: string; kind: Need["kind"]; detail: string; optional: boolean }[];
  /** A document the trader has to upload, if the step is waiting for one. */
  upload: { needId: string; label: string; docType: string | null } | null;
  /** True when the trader has nothing to do but wait. */
  waiting: boolean;
};

const list = (items: string[]): string =>
  items.length <= 1 ? items[0] ?? "" : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
const lowerFirst = (s: string) => (/^[A-Z]{2}\b/.test(s) ? s : s ? `${s.charAt(0).toLowerCase()}${s.slice(1)}` : s);

/** The published "where" often repeats itself - "my.gov.uz — unified state
 *  services my.gov.uz" - because the document names the portal twice. Keep the
 *  part that contains the other. */
function place(where: string): string {
  const parts = where
    .split(/\s+[—–-]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const kept = parts.filter((p, i) => !parts.some((other, j) => j !== i && other.toLowerCase().includes(p.toLowerCase())));
  return (kept.length ? kept : parts).join(", ");
}

/** Where the step happens, said as a place rather than a channel code. */
function where(step: StepView): string {
  const at = step.where ? place(step.where) : "";
  if (/^online/i.test(step.channel)) return at ? `online at ${at}` : "online";
  if (/in person/i.test(step.channel)) return at ? `in person at ${at}` : "in person";
  return at;
}

/** Who is involved. Who performs a step and who it is transacted with are
 *  different questions (modules/procedures/actors.ts): an online filing at
 *  Single Window is done by our agent but goes to a government body. Saying
 *  only the entity left the trader unsure whether it was theirs to do. */
function who(step: StepView): string {
  switch (actorOfStep(step)) {
    case "trader":
      return step.entity ? `You do this one yourself, dealing with ${step.entity}` : "You do this one yourself";
    case "agent":
      return `The agent does this one for you${step.entity ? `, filing it with ${step.entity}` : ""}`;
    case "bank":
      return `Your bank moves the money${step.entity ? `, to ${step.entity}` : ""}`;
    default:
      return step.entity ? `${step.entity} does this one` : "The authority handling it does this one";
  }
}

/** Why this step exists: what it produces, and what that unlocks. */
function why(step: StepView): string {
  const output = step.output?.trim();
  if (output && step.entity) return `It produces the ${inSentence(output)}, which ${step.entity} issues and later steps are checked against`;
  if (output) return `It produces the ${inSentence(output)}, which later steps are checked against`;
  if (step.entity) return `${step.entity} has to see it before the case can move on`;
  return "The steps after it wait on this one";
}

function docSubject(label: string): string {
  if (/contract/i.test(label)) return "contract";
  if (/invoice/i.test(label)) return "invoice";
  if (/waybill|railway bill|air waybill|transport/i.test(label)) return "transport";
  if (/certificate/i.test(label)) return "certificate";
  if (/receipt|payment/i.test(label)) return "payment";
  return "document";
}

/** What the trader has to do, in the imperative. */
function whatToDo(step: StepView): string {
  const at = where(step);
  // The published step title is already an instruction ("Register foreign
  // trade contract in UEISFTO"); the action label is a verb on its own.
  const action = step.title.trim();
  if (step.lane === "agent") {
    return step.paused
      ? `The agent is filing this with ${step.entity || "the entity"} and needs something from you before it can carry on`
      : `The agent is doing this one for you${at ? ` ${at}` : ""} — nothing for you to do`;
  }
  if (step.lane === "physical") {
    return `This one happens at the goods${at ? `, ${at}` : ""}: ${inSentence(action)}`;
  }
  return `${action}${at ? `, ${at}` : ""}`;
}

/** The missing things, worst first: what blocks the step before what is optional. */
function missingNeeds(step: StepView): Need[] {
  return step.needs
    .filter((n) => !n.notApplicable && !n.output && n.status !== "have")
    .sort((a, b) => Number(a.optional) - Number(b.optional) || Number(b.status === "missing") - Number(a.status === "missing"));
}

export function briefStep(step: StepView): Briefing {
  const missing = missingNeeds(step);
  const blocking = missing.filter((n) => !n.optional);
  const documents = blocking.filter((n) => n.kind === "document");
  const waiting = step.lane === "agent" && !step.paused;

  const first = documents[0] ?? null;
  const otherBlocking = blocking.filter((n) => n !== first);
  const paragraphs: string[] = [];

  if (first) {
    paragraphs.push(`For this step, please send the ${lowerFirst(first.label)}.`);
    paragraphs.push(
      step.output
        ? `I need it so ${step.entity || "the next authority"} can issue the ${inSentence(step.output)}, and so the document and risk agents can check the ${docSubject(first.label)} details against this shipment.`
        : `I need it so the document and risk agents can check the ${docSubject(first.label)} details against this shipment before we move on.`,
    );
  } else if (step.lane === "agent") {
    paragraphs.push(
      step.paused
        ? `I need something from you before I can continue ${lowerFirst(step.title)}${step.entity ? ` with ${step.entity}` : ""}.`
        : `I am handling ${lowerFirst(step.title)}${step.entity ? ` with ${step.entity}` : ""}.`,
    );
    if (!step.paused) paragraphs.push("I will come back when the entity answers.");
  } else {
    paragraphs.push(sentence(whatToDo(step)));
    paragraphs.push(sentence(who(step)));
    paragraphs.push(sentence(why(step)));
  }

  if (step.lane === "user" && otherBlocking.length) {
    const details = otherBlocking.map((n) => lowerFirst(n.label));
    if (otherBlocking.length === 1 && otherBlocking[0].kind === "confirm") paragraphs.push(`I also need you to confirm ${details[0]}.`);
    else paragraphs.push(`I also need ${list(details)}.`);
  }

  if (waiting && !paragraphs.some((p) => /come back/.test(p))) paragraphs.push("I will come back when the entity answers.");

  return {
    headline: step.title,
    paragraphs,
    missing: missing.map((n) => ({ id: n.id, label: n.label, kind: n.kind, detail: n.detail, optional: n.optional })),
    upload: first ? { needId: first.id, label: first.label, docType: first.docType } : null,
    waiting,
  };
}

type UploadField = { label: string; value: unknown; required: boolean; status: string };
type UploadBrief = { label: string; parseError?: string | null; fields?: UploadField[] };

const named = (items: string[]) => list(items.map(lowerFirst));

export function briefDocumentUpload(record: UploadBrief): string[] {
  const label = lowerFirst(record.label);
  if (record.parseError) {
    return [
      `Got the ${label}.`,
      `I kept it, but I could not read it clearly: ${record.parseError}.`,
      "Please upload a clearer copy or send the missing details here.",
    ];
  }

  const fields = record.fields ?? [];
  const verified = fields.filter((f) => (f.status === "accepted" || f.status === "confirmed") && f.value).map((f) => f.label);
  const review = fields.filter((f) => f.status === "review" && f.value).map((f) => f.label);
  const missing = fields.filter((f) => f.required && f.status === "missing").map((f) => f.label);

  const lines = [`Got the ${label}.`];
  if (verified.length) lines.push(`The document agent verified ${named(verified)}.`);
  else lines.push("The document agent saved it, but still needs a few details checked.");

  const asks: string[] = [];
  if (review.length) asks.push(`confirm ${named(review)}`);
  if (missing.length) asks.push(`add ${named(missing)} if you have it`);
  if (asks.length === 2) lines.push(`Please ${asks[0]}, and ${asks[1]}.`);
  else if (asks.length) lines.push(`Please ${list(asks)}.`);
  else lines.push("All required fields are clear.");

  lines.push("Once those are clear, the risk agent can compare the invoice with the shipment route, value, weight and later customs documents.");
  return lines;
}

/** The whole case in a line or two, for the top of a resumed conversation. */
export function briefCase(view: AssistantView): string[] {
  if (view.status === "completed") return [`${view.title} is finished — every step is done.`];
  const done = view.completed.length;
  const next = view.next;
  const lines = [`${view.title}: ${done} step${done === 1 ? "" : "s"} done.`];
  if (next) lines.push(`Next is step ${next.stepNum}, ${inSentence(next.title)}.`);
  if (view.parallel.length) {
    lines.push(`${view.parallel.length} other step${view.parallel.length === 1 ? " is" : "s are"} running alongside it.`);
  }
  return lines;
}

/* --------------------------------------------------- opening a case ------ */

export type Opening = {
  /** The whole message, paragraph by paragraph, for streaming. */
  paragraphs: string[];
  /** The two figures set beside each other, because they are a comparison. */
  comparison: { published: string; withAgents: string; saved: string } | null;
};

const hours = (h: [number, number]): string => {
  // A range carries its unit once: "3-10 days", not "3 days-10 days".
  const inDays = h[1] >= 48;
  const value = (n: number) => (inDays ? Math.round(n / 24) : Math.round(n));
  const unit = inDays ? "days" : "hours";
  const low = value(h[0]);
  const high = value(h[1]);
  return low === high ? `${high} ${unit}` : `${low}–${high} ${unit}`;
};

const round = (minutes: number): string => {
  // No hedge here: the sentence around it supplies "roughly".
  if (minutes < 90) return `${Math.round(minutes)} minutes`;
  const h = minutes / 60;
  return h < 20 ? `${Math.round(h)} hours` : `${Math.round(h / 24)} days`;
};

/** What the trader is told the moment a case exists: what they asked for, what
 *  it takes, what the agents take off it, what can be given now, and what
 *  happens next. Every figure comes from the case - the published timeframe,
 *  the step counts, the upfront plan - and the saving is named as an estimate
 *  because that is what it is. */
export function briefOpening(input: {
  view: AssistantView;
  /** As the trader described it: "20 t of tea from Tashkent to Almaty by train". */
  shipment: string;
  direction: string;
  /** The procedure's published end-to-end timeframe. */
  published: [number, number];
  agentMinutesEach: number;
}): Opening {
  const { view, shipment, direction, published, agentMinutesEach } = input;
  const k = view.kpis;
  const savedMinutes = k.agentTotal * agentMinutesEach;

  // Everything about the shipment was said in the summary before it opened;
  // what is new now is the case itself and what having the agents on it buys.
  const faster = k.etaHours[1] < published[1];
  const paragraphs: string[] = [
    `Done — your ${direction} case for ${shipment} is open.`,
    `With me handling the online filings, it should take about ${hours(k.etaHours)}` +
      `${faster ? ` instead of the usual ${hours(published)}` : ""}, and roughly ${round(savedMinutes)} less form-filling for you. ` +
      "Here's where we start.",
  ];

  return { paragraphs, comparison: null };
}
