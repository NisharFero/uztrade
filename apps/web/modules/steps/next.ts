/* One step as the trader meets it: who does it, what it needs, what is already
 * there, and whether it can move. The same function decides whether an agent
 * step may run (orchestrator) and whether a trader step may complete (API), so
 * the chat and the engine can never disagree about what is missing. */

import { ACTIONS, actionOfStep, isGatewayPayment, type Lane } from "../procedures/delegation";
import type { Procedure, ProcedureStep } from "../procedures/data/procedures.generated";
import { docTypeOf, specFor, type DocType } from "../documents/specs";
import { needsOfStep, type StepInput } from "../procedures/requirements";
import type { WorkflowNodeRecord, WorkflowProjection } from "../workflow/repository";
import { formOfStep, groupOfLabel, groupsOfStep, resolveForm, type FormView } from "./application-forms";
import { blockExtras, stepExtras, type Prefill } from "../workflow/tailor";
import { portalStep } from "../portals/needs";
import { PAYMENT_AUTHORISATION } from "./authorisation";
import type { PortalView } from "../portals/records";
import { documentComplete, documentFor, inputKey, labelKey, type DocumentRecord, type Ledger } from "./ledger";

export type NeedKind = "document" | "value" | "confirm" | "earlier" | "info" | "form";
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
  /** A portal application: its groups and the fields each asks for. */
  form: FormView | null;
  /** A published input this shipment doesn't need (e.g. a letter for a route it doesn't take). */
  notApplicable: boolean;
  /** Values that would satisfy it, each with where it comes from (an entity's answer, the HS nomenclature, the case). */
  suggestions?: { value: string; label: string; source: string }[];
  /** Why it is needed, in plain words (a model's explanation of an entity's answer). */
  explanation?: string | null;
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
  /** What this shipment's context says about the step and its block. */
  notes: string[];
  /** Where the step stands with its entity API, when the agent files it there. */
  portal: PortalView | null;
};

/* Section 5 lines that are a value to type, not a document to upload. */
const VALUE_INPUT =
  /^(payment sum|quantity of transport units|amount of consignment|cost on the contract|agency region|type of organi[sz]ation|name of the organi[sz]ation|full name of an organi[sz]ation'?s manager|contact phone number|email|tax identification number|personal identification number|bank details|warehouse license number|information about|general information|supplier information|payment information)/i;

const PRESENCE_TEXT: [RegExp, string][] = [
  [/physical presence/i, "You or your representative attend in person"],
  [/availability by phone/i, "You're reachable by phone for the approval call"],
  [/internet access/i, "You have internet access for the portal"],
];

type Context = { ledger: Ledger; nodes: Map<number, WorkflowNodeRecord>; lane: Lane; stepNum: number; prefill: Record<string, Prefill> };

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
    form: null,
    notApplicable: false,
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
        // Known from the shipment's context (e.g. transport units from the quantity); typing a value overrides it.
        const prefill = record ? undefined : ctx.prefill[input.label];
        if (prefill) {
          return { ...common, kind: "value", status: "have", value: prefill.value, autoFilled: true, detail: `From ${prefill.source} — type to change it` };
        }
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

  const extras = stepExtras(step);
  const block = procedure.blocks.find((b) => b.steps.some((s) => s.num === step.num));
  const ctx: Context = { ledger, nodes: new Map(projection.nodes.map((n) => [n.stepNum, n])), lane: node.lane, stepNum: node.stepNum, prefill: extras.prefill };
  const raw = needsOfStep(step, steps.filter((s) => s.num < step.num));
  let needs = raw.common.map((input) => needOf(input, ctx));

  // A portal application and its "Information about …" groups become one form
  // with the fields the portal actually asks for (see application-forms.ts).
  const form = formOfStep(step.inputs);
  if (form) {
    const view = resolveForm(form, groupsOfStep(step.inputs), { ledger, facts: projection.shipmentFacts });
    needs = needs.filter((n) => !form.application.test(n.label) && !groupOfLabel(n.label));
    needs.unshift({
      ...base({ label: form.title, optional: false, docType: null }, step.num),
      kind: "form",
      status: view.complete ? "have" : "missing",
      detail: view.complete
        ? `Ready for ${form.portal}${view.prefilled ? ` — ${view.prefilled} details filled from the case` : ""}`
        : `What ${form.portal} asks for — pre-filled where the case already knows it`,
      autoFilled: view.complete && view.prefilled > 0,
      form: view,
    });
  }

  // The shipment workflow (modules/workflow/tailor.ts): published inputs the
  // context rules out stop gating, and requirements it adds gate like any other.
  const applyNotNeeded = (list: Need[]): Need[] =>
    list.map((n) => {
      const hit = extras.notNeeded.find((x) => labelKey(x.label) === labelKey(n.label));
      return hit ? { ...n, kind: "info" as const, status: "have" as const, optional: true, notApplicable: true, autoFilled: false, detail: `Not needed: ${hit.reason}` } : n;
    });
  needs = applyNotNeeded(needs);
  for (const extra of extras.extraNeeds) {
    if (extra.kind === "document") {
      const need = documentNeed(extra.label, extra.docType, false, ctx);
      needs.push({ ...need, detail: `${extra.reason} — ${need.detail}` });
    } else {
      const done = ledger.inputs.has(inputKey("confirm", node.stepNum, extra.label));
      needs.push({ ...base({ label: extra.label, optional: false, docType: null }, node.stepNum), kind: "confirm", status: done ? "have" : "missing", detail: `${extra.reason} (${extra.source})` });
    }
  }

  // A step you or the goods complete also hands over what it produces.
  const outputType = docTypeOf(step.output);
  if (node.lane !== "agent" && outputType) needs.push(documentNeed(step.output, outputType, false, ctx, true));

  // Money moves only once the account holder has authorised this transfer.
  const gateway = node.lane === "agent" && isGatewayPayment(step);
  if (gateway) {
    const done = ledger.inputs.has(inputKey("confirm", node.stepNum, PAYMENT_AUTHORISATION));
    needs.push({
      ...base({ label: PAYMENT_AUTHORISATION, optional: false, docType: null }, node.stepNum),
      kind: "confirm",
      status: done ? "have" : "missing",
      detail: done
        ? "Authorised — the agent sends the transfer to the payment gateway"
        : "Authorise the agent to pay this from your account — the gateway checks the amount against the invoice before it books it",
    });
  }

  // An agent step filed with an entity API: the fields the entity refused or sent back gate it (modules/portals).
  const portal = portalStep(procedure, projection, ledger, step, node);
  needs.push(...portal.needs);

  // The agent pays online, so a gateway payment takes the online variant.
  const onlineVariant = gateway ? raw.variants.find((v) => /online/i.test(v.label))?.label ?? null : null;
  const chosenLabel =
    ledger.inputs.get(inputKey("variant", node.stepNum))?.value ?? onlineVariant ?? (raw.variants.length === 1 ? raw.variants[0].label : null);
  const variants: Variant[] = raw.variants.map((v) => ({
    label: v.label,
    chosen: v.label === chosenLabel,
    needs: applyNotNeeded(v.inputs.map((input) => needOf(input, ctx))),
  }));

  const blocking = needs
    .filter((n) => !n.optional && n.status !== "have")
    .flatMap((n) => (n.form ? n.form.missing.map((m) => `${n.label} — ${m}`) : [describe(n)]));
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
    notes: [...(block ? blockExtras(block).notes : []), ...extras.notes],
    portal: portal.view,
  };
}

/** Steps waiting on someone, lowest step number first. */
export function openNodes(projection: WorkflowProjection): WorkflowNodeRecord[] {
  return projection.nodes.filter((n) => n.state === "needs_input").sort((a, b) => a.stepNum - b.stepNum);
}
