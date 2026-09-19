/* Questions answered from the published procedures.
 *
 * The corpus is the app's own data: every procedure, stage and step (entity,
 * channel, where, who does it, inputs, output), the country list and the
 * document specs, plus the FAQ. Retrieval is BM25 over those passages. A
 * model - they are public data, so Groq may see them - answers only from the
 * passages it is given and cites them. An answer is withheld, with the reason,
 * when it cites nothing or states a number or web address its cited passages
 * don't contain. With no model the closest passages are returned as they are. */

import { z } from "zod";
import { llmJson, type LlmClient } from "../ai/llm";
import { DOC_SPECS } from "../documents/specs";
import { PARTNER_COUNTRIES } from "../intake/data/countries";
import { delegationOfStep } from "../procedures/delegation";
import { CATALOGUE, PROCEDURE_IDS } from "../procedures/data/procedures.generated";
import { FAQ } from "./faq";

export type Passage = { id: string; title: string; text: string; href: string | null };

export type FaqAnswer = {
  question: string;
  found: boolean;
  /** Plain text with [n] markers pointing into `sources`. */
  answer: string | null;
  sources: Passage[];
  by: "model" | "retrieval";
  model: string | null;
  /** Why a model's answer isn't shown, when it was withheld. */
  withheld: string | null;
};

const LANE: Record<string, string> = { user: "the trader", agent: "the platform's agent", physical: "at the goods (in person)" };

let corpus: Passage[] | null = null;

export function passages(): Passage[] {
  if (corpus) return corpus;
  const out: Passage[] = [];
  // One passage per procedure, from the catalogue: at 243 procedures the
  // step-by-step corpus would be 3.4 MB of workflow in every isolate. Step
  // detail is on the procedure's own page, and the case assistant answers
  // step questions from the case's loaded workflow (modules/steps/procedure-qa).
  for (const id of PROCEDURE_IDS) {
    const p = CATALOGUE[id];
    out.push({
      id: `procedure:${id}`,
      title: `${p.title} (procedure ${id})`,
      text: `${p.title}: ${p.stepsCount} steps in ${p.blocksCount} stages, ${p.onlineCount} of them online, published duration ${p.timeframe[0]}–${p.timeframe[1]} hours. ${p.kind === "service" ? "A service procedure — obtaining one document or registering one contract." : `${p.direction} of ${p.goods}${p.mode === "any" ? "" : ` by ${p.mode}`}.`} Entities involved: ${p.entities.join("; ")}.`,
      href: `/procedures/${id}`,
    });
  }

  for (const c of PARTNER_COUNTRIES) {
    out.push({
      id: `country:${c.iso}`,
      title: `${c.name} — country requirements`,
      text: `Proof of origin: ${c.originProof ?? "not listed"}. ${c.eaeu ? "EAEU member." : "Not an EAEU member."} Crossing points: ${c.crossingPoints.join(", ") || c.crossingNote || "not listed"}. Destination requirements: ${c.destinationRequirements.join("; ") || "none listed"}.`,
      href: null,
    });
  }
  for (const spec of Object.values(DOC_SPECS)) {
    out.push({ id: `document:${spec.type}`, title: `${spec.name} — document`, text: `${spec.purpose} Checked: ${spec.checks.join("; ")}.`, href: null });
  }
  for (const f of FAQ) out.push({ id: `faq:${f.id}`, title: f.question, text: f.answer.join(" "), href: f.link?.href ?? "/faq" });
  corpus = out;
  return out;
}

const STOP = new Set(
  "the a an and or of to in on for is are do does i we my our with by at from be it this that what which how when where who can need needs there any as into about me you your их и в на по для с из что как нужно ли".split(" "),
);
const stem = (t: string) => (t.length > 4 ? t.replace(/(ies)$/, "y").replace(/(es|s)$/, "") : t);
export const terms = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-zа-яёўқғҳ0-9]+/i)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);

type Index = { docs: { passage: Passage; tf: Map<string, number>; length: number }[]; df: Map<string, number>; avg: number };
let index: Index | null = null;

function buildIndex(): Index {
  if (index) return index;
  const docs = passages().map((passage) => {
    const words = terms(`${passage.title} ${passage.title} ${passage.text}`);
    const tf = new Map<string, number>();
    for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1);
    return { passage, tf, length: words.length };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const w of d.tf.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  index = { docs, df, avg: docs.reduce((n, d) => n + d.length, 0) / docs.length };
  return index;
}

export function retrieve(question: string, limit = 8): { passage: Passage; score: number }[] {
  const { docs, df, avg } = buildIndex();
  const q = [...new Set(terms(question))];
  const k1 = 1.2;
  const b = 0.75;
  return docs
    .map((d) => {
      let score = 0;
      for (const w of q) {
        const f = d.tf.get(w);
        if (!f) continue;
        const idf = Math.log(1 + (docs.length - df.get(w)! + 0.5) / (df.get(w)! + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avg)));
      }
      return { passage: d.passage, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, limit);
}

const dashes = (s: string) => s.toLowerCase().replace(/[–—-]/g, "-");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Numbers and web addresses in an answer that the passages it cites don't contain. */
export function unsupportedClaims(answer: string, cited: Passage[]): string[] {
  const source = dashes(cited.map((p) => `${p.title} ${p.text}`).join(" "));
  const text = answer.replace(/\[\d+\]/g, " ");
  const numbers = text.match(/\d+(?:[.,–—-]\d+)*/g) ?? [];
  const addresses = text.match(/\b[\w-]+(?:\.[\w-]+)*\.(?:uz|com|org|net|ru|gov|kz|cn)\b/gi) ?? [];
  const found = (claim: string) => new RegExp(`(^|[^\\d\\w])${escapeRe(dashes(claim))}($|[^\\d\\w])`).test(source);
  // "4,5,8" is a list of step numbers, not one number: each has to be there.
  const listed = (claim: string) => /^\d{1,3}(,\d{1,3})+$/.test(claim) && !/^\d{1,3}(,\d{3})+$/.test(claim) && claim.split(",").every(found);
  return [...new Set([...numbers, ...addresses])].filter((claim) => !found(claim) && !listed(claim));
}

const Answered = z.object({ found: z.boolean(), answer: z.string().max(1500).nullish(), citations: z.array(z.number().int()).max(8).default([]) });

const SYSTEM = [
  "You answer questions about Uzbekistan export and import procedures using ONLY the numbered passages given.",
  "Put a citation like [1] after every sentence, and list the numbers you cited in citations.",
  "If the passages don't answer the question, set found to false and answer to null.",
  "Don't add fees, durations, websites, laws, documents or steps that aren't in the passages. At most 4 sentences.",
  'Example: {"found": true, "answer": "Apply online through the Single Window [2]. It follows the internal certificate [1].", "citations": [2, 1]}',
].join("\n");

/* "What goods can I move?", "which procedures are supported?" - a question about scope. */
const SCOPE =
  /\b(what|which)\b[^?]{0,40}\b(goods|products|commodit(y|ies)|shipments?|procedures?|cargo)\b[^?]{0,40}\b(can|could|support(ed)?|cover(ed)?|move|allowed|available|handle)\b|\bsupported (goods|procedures|shipments)\b|\bwhat (do|does) (you|uztrade) (support|cover)\b/i;

/** Passage search. A question about scope gets the FAQ entry listing every procedure first:
 *  word overlap alone ranked single steps above it, and the answer named three goods of ten. */
export function retrieveWithFaq(question: string, limit = 8): { passage: Passage; score: number }[] {
  const hits = retrieve(question, limit);
  if (!SCOPE.test(question)) return hits;
  const supported = passages().find((p) => p.id === "faq:supported");
  if (!supported) return hits;
  return [{ passage: supported, score: Number.POSITIVE_INFINITY }, ...hits.filter((h) => h.passage.id !== supported.id)].slice(0, limit);
}

export async function answerQuestion(question: string, llm?: LlmClient): Promise<FaqAnswer> {
  const hits = retrieveWithFaq(question, 8);
  const closest = hits.slice(0, 4).map((h) => h.passage);
  const none: FaqAnswer = { question, found: false, answer: null, sources: closest, by: "retrieval", model: null, withheld: null };
  if (!hits.length) return none;

  const prompt = `Question: ${question}\n\nPassages:\n${hits.map((h, i) => `[${i + 1}] ${h.passage.title}\n${h.passage.text.slice(0, 700)}`).join("\n\n")}`;
  const ask = (extra = "") => llmJson(llm, { sensitivity: "public", system: SYSTEM, prompt: `${prompt}${extra}`, schema: Answered, maxTokens: 1500 });
  // Cited by number in the list or by marker in the text.
  const citedIn = (data: z.infer<typeof Answered>) =>
    [...new Set([...data.citations, ...[...(data.answer ?? "").matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]))])].filter((n) => n >= 1 && n <= hits.length);

  let reply = await ask();
  if (reply?.data.found && reply.data.answer && !citedIn(reply.data).length) {
    reply = (await ask("\n\nYour previous answer cited no passage. Answer again with [n] citations, or set found to false.")) ?? reply;
  }
  if (!reply) return none;
  const { data } = reply;
  const cited = citedIn(data);
  if (!data.found || !data.answer) return { ...none, model: reply.model };
  if (!cited.length) return { ...none, model: reply.model, withheld: "The model's answer cited no passage, so it isn't shown." };

  const sources = cited.map((n) => hits[n - 1].passage);
  const unsupported = unsupportedClaims(data.answer, sources);
  if (unsupported.length) {
    return { ...none, model: reply.model, withheld: `The model's answer mentioned ${unsupported.map((c) => `“${c}”`).join(", ")}, which its sources don't say, so it isn't shown.` };
  }

  // Renumber the citations 1..k in the order of `sources`, and drop markers to passages not cited.
  const order = new Map(cited.map((n, i) => [n, i + 1]));
  const answer = data.answer.replace(/\[(\d+)\]/g, (_m, n) => (order.has(Number(n)) ? `[${order.get(Number(n))}]` : "")).replace(/\s+([.,;])/g, "$1");
  return { question, found: true, answer, sources, by: "model", model: reply.model, withheld: null };
}
