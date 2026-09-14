/* One step as the trader meets it: who does it, what it needs, what is already
 * there, and whether it can move. The same function decides whether an agent
 * step may run (orchestrator) and whether a trader step may complete (API), so
 * the chat and the engine can never disagree about what is missing. */

import { ACTIONS, actionOfStep, type Lane } from "../../data/delegation";
import type { Procedure, ProcedureStep } from "../../data/procedures.generated";
import { docTypeOf, specFor, type DocType } from "../document-specs";
import { needsOfStep, type StepInput } from "../requirements";
import type { WorkflowNodeRecord, WorkflowProjection } from "../workflow-repository";
import { documentComplete, documentFor, inputKey, labelKey, type DocumentRecord, type Ledger } from "./ledger";

export type NeedKind = "document" | "value" | "confirm" | "earlier" | "info";
export type NeedStatus = "have" | "missing" | "review" | "waiting";

export type Need = {
  id: string;
  label: string;
  kind: NeedKind;
  status: NeedStatus;
  optional: boolean;
  detail: string;
  docType: DocType | null;
  /** Fields the document must show before the step can move. */
  requiredFields: string[];
  document: DocumentRecord | null;
  producedBy: number | null;
  value: string | null;
  /** Satisfied from something given at an earlier step - counts toward time saved. */
  autoFilled: boolean;
  /** This step's own output, rather than an input. */
  output: boolean;
};

export type Variant = { label: string; chosen: boolean; needs: Need[] };

export type StepView = {
  nodeId: string;
  stepNum: number;
  title: string;
  blockName: string;
  lane: Lane;
  actionLabel: string;
  agentHelp: string;
  entity: string;
  where: string;
  channel: string;
  output: string;
  state: string;
  workItemId: string | null;
  /** An agent step waiting on the trader. */
  paused: boolean;
  needs: Need[];
  variants: Variant[];
  ready: boolean;
  blocking: string[];
};

/* Section 5 lines that are a value to type, not a document to upload. */
const VALUE_INPUT =
  /^(payment sum|quantity of transport units|amount of consignment|cost on the contract|agency region|type of organi[sz]ation|name of the organi[sz]ation|full name of an organi[sz]ation'?s manager|contact phone number|email|tax identification number|personal identification number|bank details|warehouse license number|information about|general information|supplier information|payment information)/i;

const PRESENCE_TEXT: [RegExp, string][] = [
  [/physical presence/i, "You or your representative attend in person"],
  [/availability by phone/i, "You're reachable by phone for the approval call"],
  [/internet access/i, "You have internet access for the portal"],
];

type Context = { ledger: Ledger; nodes: Map<number, WorkflowNodeRecord>; lane: Lane; stepNum: number };

function base(input: Pick<StepInput, "label" | "optional" | "docType">, stepNum: number): Omit<Need, "kind" | "status" | "detail"> {
  return {
    id: `${stepNum}:${labelKey(input.label)}`,
    label: input.label,
    optional: input.optional,
    docType: input.docType,
    requiredFields: [],
    document: null,
    producedBy: null,
    value: null,
    autoFilled: false,
    output: false,
  };
}

function confirmNeed(input: StepInput, ctx: Context, detail: string): Need {
  const record = ctx.ledger.inputs.get(inputKey("confirm", ctx.stepNum, input.label));
  return { ...base(input, ctx.stepNum), kind: "confirm", status: record ? "have" : "missing", detail };
}

function documentNeed(label: string, docType: DocType | null, optional: boolean, ctx: Context, output = false): Need {
  const spec = docType ? specFor(docType) : null;
  const requiredFields = spec ? spec.fields.filter((f) => f.required && (f.questions.length || f.anchors.length)).map((f) => f.name) : [];
  const doc = documentFor(ctx.ledger, label, docType, output ? ctx.stepNum : undefined);
  // Confirmed at this step, or at the start of the case (step 0) as an upfront input.
  const confirmedOutside =
    !docType && (ctx.ledger.inputs.has(inputKey("confirm", ctx.stepNum, label)) || ctx.ledger.inputs.has(inputKey("confirm", 0, label)));
  const common = { ...base({ label, optional, docType }, ctx.stepNum), requiredFields, document: doc, output };

  if (confirmedOutside) return { ...common, kind: "document", status: "have", detail: "Confirmed as provided" };
  if (!doc) {
    return {
      ...common,
      kind: "document",
      status: "missing",
      detail: requiredFields.length
        ? `Upload it — the agent reads ${requiredFields.slice(0, 6).join(", ")}${requiredFields.length > 6 ? "…" : ""}`
        : output
          ? "Upload it when you receive it"
          : "Upload it, or confirm you've provided it",
    };
  }
  if (documentComplete(doc)) {
    const earlier = doc.stepNum < ctx.stepNum;
    return {
      ...common,
      kind: "document",
      status: "have",
      autoFilled: earlier,
      detail: earlier ? `${doc.fileName} — uploaded at step ${doc.stepNum}` : `${doc.fileName} — ${doc.fields.filter((f) => f.value).length} fields read`,
    };
  }
  const open = doc.fields.filter((f) => f.required && f.status !== "accepted" && f.status !== "confirmed").map((f) => f.label);
  const why = doc.parseError
    ? "couldn't be read automatically — confirm its fields"
    : !doc.typeMatches && doc.detectedType
      ? `looks like a ${specFor(doc.detectedType).name.toLowerCase()}, not a ${spec?.name.toLowerCase() ?? "document of this type"}`
      : open.length
        ? `confirm ${open.join(", ")}`
        : "confirm the fields";
  return { ...common, kind: "document", status: "review", detail: `${doc.fileName} — ${why}` };
}

function needOf(input: StepInput, ctx: Context): Need {
  const common = base(input, ctx.stepNum);
  switch (input.kind) {
    case "produced": {
      const from = input.producedBy!;
      const node = ctx.nodes.get(from.stepNum);
      const done = node?.state === "completed" || node?.state === "skipped";
      return {
        ...common,
        kind: "earlier",
        producedBy: from.stepNum,
        status: done ? "have" : "waiting",
        autoFilled: done,
        detail: done ? `From step ${from.stepNum} — ${from.output}` : `Produced at step ${from.stepNum} (${from.title})`,
      };
    }
    case "published":
      return { ...common, kind: "info", status: "have", detail: "Published by the entity — the agent looks it up" };
    case "identity":
      if (ctx.lane === "agent") return { ...common, kind: "info", status: "have", detail: "Covered by the platform's portal integration" };
      return confirmNeed(input, ctx, `You'll use your own ${input.label} — the agent can't hold it`);
    case "presence":
      if (ctx.lane === "agent") return { ...common, kind: "info", status: "have", detail: "Not needed when the agent files it" };
      return confirmNeed(input, ctx, PRESENCE_TEXT.find(([re]) => re.test(input.label))?.[1] ?? input.label);
    case "profile":
    case "case":
    default: {
      if (input.docType) return documentNeed(input.label, input.docType, input.optional, ctx);
      if (VALUE_INPUT.test(input.label)) {
        const record = ctx.ledger.inputs.get(inputKey("value", 0, input.label));
        return {
          ...common,
          kind: "value",
          status: record ? "have" : "missing",
          value: record?.value ?? null,
          autoFilled: Boolean(record && record.stepNum < ctx.stepNum),
          detail: record
            ? record.stepNum < ctx.stepNum
              ? `Given at step ${record.stepNum} — reused`
              : "Given"
            : input.kind === "profile"
              ? "Company profile — asked once, reused at later steps"
              : "For this shipment",
        };
      }
      return documentNeed(input.label, docTypeOf(input.label), input.optional, ctx);
    }
  }
}

const describe = (n: Need) =>
  n.status === "waiting" ? `${n.label} (from step ${n.producedBy})` : n.status === "review" ? `${n.label} — confirm fields` : n.label;

export function stepViewFor(procedure: Procedure, projection: WorkflowProjection, ledger: Ledger, node: WorkflowNodeRecord): StepView {
  const steps: ProcedureStep[] = procedure.blocks.flatMap((b) => b.steps).sort((a, b) => a.num - b.num);
  const step = steps.find((s) => s.num === node.stepNum);
  if (!step) throw new Error(`Procedure ${procedure.id} has no step ${node.stepNum}`);

  const ctx: Context = { ledger, nodes: new Map(projection.nodes.map((n) => [n.stepNum, n])), lane: node.lane, stepNum: node.stepNum };
  const raw = needsOfStep(step, steps.filter((s) => s.num < step.num));
  const needs = raw.common.map((input) => needOf(input, ctx));

  // A step you or the goods complete also hands over what it produces.
  const outputType = docTypeOf(step.output);
  if (node.lane !== "agent" && outputType) needs.push(documentNeed(step.output, outputType, false, ctx, true));

  const chosenLabel = ledger.inputs.get(inputKey("variant", node.stepNum))?.value ?? (raw.variants.length === 1 ? raw.variants[0].label : null);
  const variants: Variant[] = raw.variants.map((v) => ({
    label: v.label,
    chosen: v.label === chosenLabel,
    needs: v.inputs.map((input) => needOf(input, ctx)),
  }));

  const blocking = needs.filter((n) => !n.optional && n.status !== "have").map(describe);
  if (variants.length) {
    const chosen = variants.find((v) => v.chosen);
    if (!chosen) blocking.push(`Choose one: ${variants.map((v) => v.label).join(" or ")}`);
    else blocking.push(...chosen.needs.filter((n) => !n.optional && n.status !== "have").map(describe));
  }

  const action = actionOfStep(step);
  const work = projection.workItems.find((w) => w.nodeId === node.id && w.state === "open");
  return {
    nodeId: node.id,
    stepNum: node.stepNum,
    title: step.title,
    blockName: node.blockName,
    lane: node.lane,
    actionLabel: ACTIONS[action].label,
    agentHelp: ACTIONS[action].agent,
    entity: step.entity,
    where: step.where,
    channel: step.channel,
    output: step.output,
    state: node.state,
    workItemId: work?.id ?? null,
    paused: node.lane === "agent" && node.state === "needs_input",
    needs,
    variants,
    ready: blocking.length === 0,
    blocking,
  };
}

/** Steps waiting on someone, lowest step number first. */
export function openNodes(projection: WorkflowProjection): WorkflowNodeRecord[] {
  return projection.nodes.filter((n) => n.state === "needs_input").sort((a, b) => a.stepNum - b.stepNum);
}
