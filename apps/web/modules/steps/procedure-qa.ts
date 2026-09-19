import { z } from "zod";
import { llmJson, type LlmClient } from "../ai/llm";
import { DOC_SPECS, docTypeOf, type DocSpec } from "../documents/specs";
import { answerQuestion } from "../faq/answer";
import { commodityOf, type Category } from "../intake/taxonomy";
import { lookupProcedures } from "../intake/lookup";
import { CATALOGUE, type Procedure } from "../procedures/data/procedures.generated";
import type { WorkflowProjection } from "../workflow/repository";
import type { AssistantView } from "./assistant";
import type { Need } from "./next";

export type ProcedureQaAnswer = {
  kind: "answer" | "clarify" | "unsupported";
  title: string;
  message: string;
  bullets: string[];
  procedureId?: string;
  confirmation?: { label: string; value: string };
};

export type ProcedureQuestionRoute =
  | { route: "current_case" | "general_faq" | "procedure_match"; confidence: number; reason: string }
  | { route: "clarify"; confidence: number; reason: string; question: string; options: string[] };

export type ProcedureQaInput = {
  question: string;
  procedure: Procedure;
  projection: WorkflowProjection;
  view: AssistantView;
  llm?: LlmClient;
};

const includes = (text: string, re: RegExp) => re.test(text);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const laneLabel: Record<string, string> = { user: "you", agent: "the agent", physical: "at the goods" };

const RouteSchema = z.object({
  route: z.enum(["current_case", "general_faq", "procedure_match", "clarify"]),
  confidence: z.number().min(0).max(1).default(0.5),
  reason: z.string().max(240).default(""),
  question: z.string().max(240).optional(),
  options: z.array(z.string().max(80)).max(3).optional(),
});

const ROUTER_SYSTEM = [
  "You route a trader's question in UzTrade. Decide whether it asks about the user's current shipment, general published procedures/FAQ, goods-to-procedure matching, or needs a clarification.",
  "Use current_case only for words like my/current/this shipment/now/step/stage/blocking/upload/approval tied to the active case.",
  "Use general_faq for broad questions about export/import/procedures/documents/entities/time in general.",
  "Use procedure_match for goods or misspelled goods asking which procedure/intake applies.",
  "If an active case exists and the question could mean either current shipment or general procedure, choose clarify and ask one short follow-up.",
].join("\n");

function normalizeRoute(data: z.infer<typeof RouteSchema>): ProcedureQuestionRoute {
  if (data.route === "clarify") {
    return {
      route: "clarify",
      confidence: data.confidence,
      reason: data.reason,
      question: data.question?.trim() || "Do you mean your current shipment, or the general published procedure?",
      options: data.options?.length ? data.options : ["My current shipment", "General procedure"],
    };
  }
  return { route: data.route, confidence: data.confidence, reason: data.reason };
}

function hoursRange(hours: [number, number]): string {
  const fmt = (h: number) => {
    if (h < 24) return `${Math.round(h)} h`;
    const days = Math.floor(h / 24);
    const rest = Math.round(h - days * 24);
    return rest ? `${days} d ${rest} h` : `${days} d`;
  };
  return `${fmt(hours[0])}-${fmt(hours[1])}`;
}

function currentBlock(procedure: Procedure, stepNum: number) {
  return procedure.blocks.find((b) => b.steps.some((s) => s.num === stepNum)) ?? null;
}

function answerCurrentStep(input: ProcedureQaInput): ProcedureQaAnswer {
  const step = input.view.next;
  if (!step) {
    return {
      kind: "answer",
      title: "Current step",
      message: input.view.status === "completed" ? "Every step in this case is complete." : "No step is waiting on you right now.",
      bullets: input.view.parallel.map((p) => `Also open: step ${p.stepNum} - ${p.title}`),
    };
  }
  return {
    kind: "answer",
    title: "Current step",
    message: `Step ${step.stepNum}: ${step.title}.`,
    bullets: [
      `Current stage: ${step.blockName}.`,
      `Responsible now: ${laneLabel[step.lane] ?? step.lane}.`,
      step.ready ? "Everything needed for this step is available." : `Still needed: ${step.blocking.join("; ")}.`,
    ],
  };
}

function answerCurrentStage(input: ProcedureQaInput): ProcedureQaAnswer {
  const step = input.view.next;
  if (!step) return { kind: "answer", title: "Current stage", message: "No active stage is waiting on you right now.", bullets: [] };
  const block = currentBlock(input.procedure, step.stepNum);
  return {
    kind: "answer",
    title: "Current stage",
    message: block ? `${block.name}.` : `${step.blockName}.`,
    bullets: block
      ? [
          `Steps ${block.stepRange[0]}-${block.stepRange[1]}.`,
          `Published estimate for this stage: ${block.estDuration[0]}-${block.estDuration[1]} hours.`,
          block.dependencyReason,
        ]
      : [`Step ${step.stepNum} is in ${step.blockName}.`],
  };
}

function describeNeed(n: Need): string {
  const status = n.status === "review" ? "needs field confirmation" : n.status === "waiting" ? "waits for an earlier step" : "missing";
  return `${n.label} - ${status}${n.detail ? ` (${n.detail})` : ""}`;
}

function answerDocuments(input: ProcedureQaInput): ProcedureQaAnswer {
  const now = input.view.next?.needs.filter((n) => n.kind === "document" && n.status !== "have") ?? [];
  const upfront = input.view.upfront.items.filter((i) => i.kind === "document" && i.status !== "have").slice(0, 8);
  const bullets = [
    ...now.map(describeNeed),
    ...upfront.map((i) => `Before you start: ${i.label} - ${i.status} (${i.reason}; used at step${i.steps.length > 1 ? "s" : ""} ${i.steps.join(", ")})`),
  ];
  return {
    kind: "answer",
    title: "Documents needed",
    message: bullets.length ? "These are the document items currently blocking or useful upfront." : "No missing document is blocking the current step.",
    bullets,
  };
}

function findDocSpec(question: string): DocSpec | null {
  const direct = docTypeOf(question);
  if (direct) return DOC_SPECS[direct];
  const normalized = question.toLowerCase();
  return Object.values(DOC_SPECS).find((spec) => normalized.includes(spec.name.toLowerCase())) ?? null;
}

function answerDocumentFields(spec: DocSpec): ProcedureQaAnswer {
  const required = spec.fields.filter((f) => f.required);
  const optional = spec.fields.filter((f) => !f.required).slice(0, 6);
  return {
    kind: "answer",
    title: `${spec.name} details`,
    message: `${spec.name} is used for: ${spec.purpose}`,
    bullets: [
      ...required.map((f) => `${f.name} - required`),
      ...optional.map((f) => `${f.name} - optional/check field`),
      ...(spec.checks.length ? [`Agent checks: ${spec.checks.slice(0, 2).join("; ")}.`] : []),
    ],
  };
}

function answerTiming(input: ProcedureQaInput): ProcedureQaAnswer {
  const portals = input.view.portals.filter((p) => p.status !== "approved");
  return {
    kind: "answer",
    title: "Time and approvals",
    message: `ETA from the remaining procedure schedule is ${hoursRange(input.view.kpis.etaHours)}.`,
    bullets: [
      `Published full procedure duration: ${input.procedure.timeframe[0]}-${input.procedure.timeframe[1]} hours.`,
      portals.length
        ? `Entity applications not approved yet: ${portals.map((p) => `step ${p.stepNum} ${p.entityName} (${p.status.replace(/_/g, " ")})`).join("; ")}.`
        : "No filed entity application is currently waiting for approval.",
      "The published procedure does not give an entity approval SLA; the app tracks under-review, approved, rejected and change-requested states as they happen.",
    ],
  };
}

const FUZZY_GOODS: { value: string; re: RegExp; category: Category; term: string; hs: string }[] = [
  { value: "tomatoes", re: /\btom[ao]t[ao]s?\b|\btomota(es)?\b/i, category: "fresh fruits and vegetables", term: "tomatoes", hs: "0702" },
];

function procedureForGoods(category: Category): { id: string; title: string } | null {
  const ids = lookupProcedures(category, "export", "train");
  const id = ids[0];
  return id ? { id, title: CATALOGUE[id]?.title ?? id } : null;
}

function answerGoods(question: string): ProcedureQaAnswer | null {
  const fuzzy = FUZZY_GOODS.find((f) => f.re.test(question));
  if (fuzzy && commodityOf(question).kind !== "known") {
    const p = procedureForGoods(fuzzy.category);
    return {
      kind: "clarify",
      title: "Confirm goods",
      message: `Did you mean ${fuzzy.value}? If yes, this matches ${fuzzy.category} export by train.`,
      bullets: p ? [`Procedure ${p.id}: ${p.title}.`, `HS heading: ${fuzzy.hs}.`] : [],
      procedureId: p?.id,
      confirmation: { label: `Yes, ${fuzzy.value}`, value: fuzzy.value },
    };
  }

  const hit = commodityOf(question);
  if (hit.kind === "known") {
    const p = procedureForGoods(hit.category);
    if (!p) return null;
    return {
      kind: "answer",
      title: "Procedure match",
      message: `${cap(hit.term)} maps to ${hit.category}. For export by train, use procedure ${p.id}.`,
      bullets: [`${p.title}.`, `HS heading: ${hit.hs}.`, "If the route or mode is different, intake will re-check the published options before opening a case."],
      procedureId: p.id,
    };
  }
  if (hit.kind === "ambiguous") {
    return {
      kind: "clarify",
      title: "Clarify goods",
      message: `Are the ${hit.term} fresh or dried?`,
      bullets: hit.options.map((o) => `${cap(o)} has its own published procedure path.`),
      confirmation: { label: `Fresh ${hit.term}`, value: `fresh ${hit.term}` },
    };
  }
  if (hit.kind === "unsupported") {
    return { kind: "unsupported", title: "Unsupported goods", message: `No published procedure in this app covers ${hit.term}.`, bullets: [] };
  }
  return null;
}

function fallbackRoute(input: ProcedureQaInput): ProcedureQuestionRoute {
  const q = input.question.toLowerCase();
  const goods = answerGoods(input.question);
  const hasCase = Boolean(input.view.caseId);

  if (goods && (includes(q, /\b(export|import|procedure|intake|tom|apple|brinjal|eggplant|aubergine)\b/i) || goods.kind === "clarify")) {
    return { route: "procedure_match", confidence: 0.82, reason: "The question names goods or procedure intake." };
  }

  const asksDocuments = includes(q, /\b(doc|docs|document|documents|upload|provide|need|needed|required)\b/i);
  const asksExportGenerally = includes(q, /\bexport\b/i) && !includes(q, /\b(my|this|current|now|case|shipment|step|stage|upload)\b/i);
  if (hasCase && asksDocuments && asksExportGenerally) {
    return {
      route: "clarify",
      confidence: 0.78,
      reason: "The question can mean either the active case or export documents generally.",
      question: "Do you mean documents for your current shipment, or export documents generally?",
      options: ["My current shipment", "General export documents"],
    };
  }

  if (includes(q, /\b(my|this|current|now|case|shipment|step|stage|blocking|upload|approval)\b/i)) {
    return { route: "current_case", confidence: 0.84, reason: "The question points to the active case." };
  }

  if (includes(q, /\b(general|generally|usually|procedure|procedures|export|import|entity|entities|supported|how does|what documents)\b/i)) {
    return { route: "general_faq", confidence: 0.75, reason: "The question asks about published procedures generally." };
  }

  return {
    route: "clarify",
    confidence: 0.45,
    reason: "The scope is unclear.",
    question: "Do you mean your current shipment, or a general procedure question?",
    options: ["My current shipment", "General procedure"],
  };
}

export async function routeProcedureQuestion(input: ProcedureQaInput): Promise<ProcedureQuestionRoute> {
  const step = input.view.next;
  const prompt = [
    `Question: ${input.question}`,
    `Active case: ${input.view.caseId}`,
    `Procedure: ${input.procedure.id} - ${input.procedure.title}`,
    step ? `Current step: ${step.stepNum} - ${step.title}; stage ${step.blockName}` : "Current step: none waiting",
    `Shipment facts: ${JSON.stringify(input.projection.shipmentFacts ?? {})}`,
  ].join("\n");
  const routed = await llmJson(input.llm, { sensitivity: "public", system: ROUTER_SYSTEM, prompt, schema: RouteSchema, maxTokens: 500 });
  if (routed?.data) {
    const route = normalizeRoute(routed.data);
    // Low confidence is treated as a product follow-up, not a guess.
    if (route.confidence < 0.68 && route.route !== "clarify") {
      return {
        route: "clarify",
        confidence: route.confidence,
        reason: route.reason || "The model was not confident enough to choose a scope.",
        question: "Do you mean your current shipment, or a general procedure question?",
        options: ["My current shipment", "General procedure"],
      };
    }
    return route;
  }
  return fallbackRoute(input);
}

function clarificationAnswer(route: Extract<ProcedureQuestionRoute, { route: "clarify" }>): ProcedureQaAnswer {
  return {
    kind: "clarify",
    title: "Clarify question",
    message: route.question,
    bullets: route.options,
  };
}

function faqAnswerToProcedureAnswer(question: string, faq: Awaited<ReturnType<typeof answerQuestion>>): ProcedureQaAnswer {
  const sourceLine = faq.sources.length ? `Sources: ${faq.sources.map((s) => s.title).slice(0, 3).join("; ")}.` : "No exact source answered it.";
  return {
    kind: faq.found || faq.sources.length ? "answer" : "unsupported",
    title: "General procedure answer",
    message: faq.answer ?? `I found related published-procedure passages for: "${question}".`,
    bullets: [sourceLine, ...(faq.withheld ? [`Withheld model answer: ${faq.withheld}`] : [])],
  };
}

export async function answerRoutedProcedureQuestion(input: ProcedureQaInput): Promise<ProcedureQaAnswer> {
  const route = await routeProcedureQuestion(input);
  if (route.route === "clarify") return clarificationAnswer(route);
  if (route.route === "general_faq") return faqAnswerToProcedureAnswer(input.question, await answerQuestion(input.question, input.llm));
  return answerProcedureQuestion(input);
}

export function answerProcedureQuestion(input: ProcedureQaInput): ProcedureQaAnswer {
  const question = input.question.trim();
  const q = question.toLowerCase();

  const goods = answerGoods(question);
  if (goods && (includes(q, /\b(export|import|procedure|intake|tom|apple|brinjal|eggplant|aubergine)\b/i) || goods.kind === "clarify")) return goods;

  if (includes(q, /\b(current|currently|now|which|what)\b/i) && includes(q, /\bstage|block\b/i)) return answerCurrentStage(input);
  if (includes(q, /\b(current|currently|now|which|what)\b/i) && includes(q, /\bstep\b/i)) return answerCurrentStep(input);
  if (includes(q, /\b(doc|document|provide|upload|need)\b/i) && !includes(q, /\bdetail|field|required|required in\b/i)) return answerDocuments(input);

  const spec = findDocSpec(question);
  if (spec && includes(q, /\b(detail|field|required|contain|inside|in the)\b/i)) return answerDocumentFields(spec);

  if (includes(q, /\b(time|eta|long|approval|approved|entity|entities|schedule)\b/i)) return answerTiming(input);

  return {
    kind: "unsupported",
    title: "I need a procedure question",
    message: "Ask about the current step, stage, documents, document fields, timing, or which published procedure fits a supported good.",
    bullets: [],
  };
}
