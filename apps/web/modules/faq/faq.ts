/* Answers for questions that aren't a shipment. Everything here is read from
 * the app's own data or states how the app works - nothing general about trade
 * that the app can't back. */

import { PARTNER_COUNTRIES } from "../intake/data/countries";
import { CATALOGUE, PROCEDURE_IDS } from "../procedures/data/procedures.generated";
import { AGENT_STEP_MINUTES, AUTOFILL_MINUTES } from "../steps/kpis";

export type FaqEntry = {
  id: string;
  question: string;
  answer: string[];
  keywords: string[];
  link?: { href: string; label: string };
};

const procedures = PROCEDURE_IDS.map((id) => {
  const p = CATALOGUE[id];
  return `${p.title} (procedure ${id}, ${p.stepsCount} steps, published ${p.timeframe[0]}–${p.timeframe[1]} h)`;
});

export const FAQ: FaqEntry[] = [
  {
    id: "what",
    question: "What does UzTrade do?",
    answer: [
      "You describe a shipment in the chat. It checks what you're moving, export or import, how, how much and the route against the published procedures, then opens one case and walks you through it one step at a time.",
      "Agent steps run by themselves; your steps show exactly what's needed and wait for you.",
    ],
    keywords: ["what", "uztrade", "app", "platform", "work", "does", "about", "help", "use"],
  },
  {
    id: "supported",
    question: "Which shipments are supported?",
    answer: [`${procedures.length} published procedures:`, ...procedures],
    keywords: ["supported", "procedure", "procedures", "goods", "tea", "fruit", "fruits", "vegetables", "dried", "juice", "juices", "fertilizer", "fertilizers", "cargo", "which", "shipments", "cover", "move"],
    link: { href: "/procedures", label: "See the procedures" },
  },
  {
    id: "countries",
    question: "Which countries can a shipment go to or come from?",
    answer: [
      "One end is always Uzbekistan. The other end can be: " + PARTNER_COUNTRIES.map((c) => c.name).join(", ") + ".",
      "Each country's origin proof, crossing points and destination requirements come from the supplied country list.",
    ],
    keywords: ["country", "countries", "destination", "origin", "route", ...PARTNER_COUNTRIES.map((c) => c.name.toLowerCase())],
  },
  {
    id: "start",
    question: "How do I start a case?",
    answer: [
      "Type what you're moving, e.g. “I want to move tea”. The chat asks, in order: what, export or import, how it travels, how much, and from where to where — offering only options a published procedure has.",
      "You then see a summary and press “Create case & steps”.",
    ],
    keywords: ["start", "begin", "create", "open", "new", "case", "how"],
  },
  {
    id: "several-cases",
    question: "Can I run more than one case?",
    answer: [
      "Yes. Press + in the chat to start another case & shipment. Below the chat the dashboard shows the current step of the case you checked last — the one you just created, or the one you last opened in Cases & Shipments.",
    ],
    link: { href: "/cases", label: "Open Cases & Shipments" },
    keywords: ["second", "another", "new", "case", "parallel", "blocked", "two", "multiple"],
  },
  {
    id: "workflow",
    question: "Where do I see the whole workflow?",
    answer: ["In Cases & Shipments: open the case for its step assistant, workflow, documents, risk values and ledger. The procedure's page shows the same workflow for its latest case. The chat on the dashboard shows only the current step."],
    link: { href: "/cases", label: "Open Cases & Shipments" },
    keywords: ["workflow", "dag", "whole", "progress", "status", "where", "see", "all", "steps"],
  },
  {
    id: "steps",
    question: "What happens at each step?",
    answer: [
      "Every step is done by you, by the agent, or at the goods. The step shows what it needs: documents to upload, values, confirmations such as signing or attending, and anything produced earlier.",
      "An agent step with something missing pauses and runs by itself once it's provided. Your step completes when everything it needs is there.",
    ],
    keywords: ["step", "steps", "next", "agent", "pause", "paused", "complete", "needs"],
  },
  {
    id: "upfront",
    question: "What can I provide before a step comes?",
    answer: [
      "Anything no earlier step produces and that you already hold or issue yourself: the trade contract, passport and power of attorney, the commercial invoice, your own applications and letters, bank confirmations and company details.",
      "Offer amounts, agreements concluded during the procedure, portal applications and every step's output have to wait for their step.",
    ],
    keywords: ["upfront", "before", "advance", "early", "first", "provide", "prepare", "ahead"],
  },
  {
    id: "documents",
    question: "How are uploaded documents read?",
    answer: [
      "A local OCR model (Russian and English) reads the page, a layout model answers one question per field, and the printed labels give a second reading. Each value gets a confidence: high is used, medium you confirm, low you type.",
      "Scans too small or blurry to read are reported as such instead of being guessed.",
    ],
    keywords: ["document", "documents", "upload", "ocr", "read", "parse", "scan", "fields", "invoice", "layoutlm"],
  },
  {
    id: "privacy",
    question: "Do my documents leave this machine?",
    answer: [
      "No. The OCR and layout models run locally; the original files are kept in the app's own storage.",
      "Where a language model helps with what documents say — a second reading of unsure fields, matching company names, ranking HS codes against the invoice description — only a model running on this machine is used. Without one, those checks run on rules alone. Your typed chat messages and questions about the procedures may go to the hosted model.",
    ],
    keywords: ["privacy", "private", "leave", "cloud", "external", "data", "secure", "security", "ai", "llm", "model", "groq"],
  },
  {
    id: "payments",
    question: "Does UzTrade pay fees for me?",
    answer: ["No. A payment step gives you a reference and waits for your receipt, which is then checked against the bill it pays."],
    keywords: ["pay", "payment", "payments", "fee", "fees", "bank", "receipt", "money"],
  },
  {
    id: "kpis",
    question: "How are ETA and time saved calculated?",
    answer: [
      "ETA is the remaining critical path through the procedure's published block estimates.",
      `Time saved is an estimate: ${AGENT_STEP_MINUTES} min for each step the agent completes plus ${AUTOFILL_MINUTES} min for each value filled from something you gave earlier.`,
    ],
    keywords: ["eta", "time", "saved", "kpi", "kpis", "estimate", "long", "duration"],
  },
  {
    id: "duty",
    question: "Does it tell me the duty or tariff?",
    answer: ["No. Uzbekistan's tariff schedule hasn't been sourced, so no duty rate is shown rather than an invented one. The HS heading is given as a suggestion."],
    keywords: ["duty", "tariff", "tax", "vat", "rate", "hs", "code", "customs"],
  },
  {
    id: "demo",
    question: "Is there demo data I can try?",
    answer: [
      `Yes, for every procedure (${PROCEDURE_IDS.join(", ")}): invented documents and values for every step, usable from the “Demo” buttons in a case or downloadable from the procedure's demo pack.`,
    ],
    keywords: ["demo", "sample", "example", "test", "try"],
    link: { href: "/procedures", label: "Pick a procedure, then its demo pack" },
  },
];

const tokens = (text: string) => text.toLowerCase().split(/[^a-zа-яё0-9]+/i).filter((t) => t.length > 1);

/** The entries closest to a question, best first; empty when nothing overlaps. */
export function matchFaq(query: string, limit = 3): FaqEntry[] {
  const words = new Set(tokens(query));
  return FAQ.map((entry) => {
    const keywordHits = entry.keywords.filter((k) => words.has(k)).length;
    const questionHits = tokens(entry.question).filter((t) => t.length > 3 && words.has(t)).length;
    return { entry, score: keywordHits * 2 + questionHits };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry);
}
