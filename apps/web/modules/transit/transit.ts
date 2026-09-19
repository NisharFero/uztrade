/* Transit & Capacity — the logistics agent.
 *
 * Document Intelligence handles paperwork, Compliance & Risk judges the rules,
 * the orchestrator runs the procedure. This agent answers the movement
 * questions: where the cargo has to go, how it moves, what capacity and
 * equipment that takes, whether transport has actually been arranged, where
 * the shipment stands now, and what is holding it up.
 *
 * Nothing here moves cargo or books anything by itself: bookings are the
 * entity APIs' job (modules/portals) and state changes come from the workflow.
 * This module reads what the case already knows — intake facts, the tailored
 * procedure, workflow node states, entity applications and the documents in
 * the ledger — and reports the movement picture back to the orchestrator.
 */

import type { Procedure, ProcedureStep } from "../procedures/data/procedures.generated";
import { delegationOfStep } from "../procedures/delegation";
import { buildShipmentPlan, countryName, fmtTonnes, toTonnes, unitsFor, type Units } from "../intake/shipment-plan";
import { inputKey, type Ledger } from "../steps/ledger";
import { latestRecords, type PortalRecord } from "../portals/records";
import type { ShipmentFacts } from "../workflow/domain";
import type { WorkflowNodeRecord, WorkflowProjection } from "../workflow/repository";

/** The movement milestones, in the order a shipment passes them. */
export const MILESTONES = [
  "planned",
  "capacity_requested",
  "capacity_confirmed",
  "cargo_ready",
  "loaded",
  "dispatched",
  "at_border",
  "cleared",
  "arrived",
] as const;
export type Milestone = (typeof MILESTONES)[number];

export const MILESTONE_LABEL: Record<Milestone, string> = {
  planned: "Planned",
  capacity_requested: "Capacity requested",
  capacity_confirmed: "Capacity confirmed",
  cargo_ready: "Cargo ready",
  loaded: "Loaded",
  dispatched: "Departed",
  at_border: "At the border",
  cleared: "Customs released",
  arrived: "Arrived",
};

/* What each milestone looks like in a published procedure. Matched on the
 * step's wording and entity, so the same rules serve all ten procedures. */
const MILESTONE_RULES: { milestone: Milestone; title: RegExp; entity?: RegExp }[] = [
  { milestone: "capacity_requested", title: /^(apply|request).*(freight|transportation|wagon|carriage)|cargo transportation gu-12|allotment of wagons|transportation on specific conditions/i },
  { milestone: "capacity_confirmed", title: /approved application for freight|notification on wagons|acceptance of wagons|approval of cargo transportation|electronic certificate for railway station|obtain.*air waybill|book.*flight/i },
  { milestone: "cargo_ready", title: /place cargo|deliver (the )?cargo|bring the goods|cargo to the (station|terminal|warehouse)|prepare for cargo|arrange cargo delivery|receive (the )?cargo/i },
  { milestone: "loaded", title: /\bload(ing)?\b/i },
  { milestone: "dispatched", title: /\bdispatch\b|hand ?over of wagons|departure of|send the (wagons|train|truck)/i },
  { milestone: "at_border", title: /border|transit declaration|crossing/i },
  { milestone: "cleared", title: /customs clearance|release[d]? (of|the)? ?(goods|declaration)|obtain.*declaration|выпуск/i },
  { milestone: "arrived", title: /arrival|unload|delivery to the consignee|deliver(ed)? to destination|duplicate of railway bill/i },
];

/** A leg of the physical journey, in order. */
export type TransitLeg = {
  id: string;
  title: string;
  place: string;
  state: "done" | "active" | "waiting";
  steps: number[];
};

export type TransitReference = { label: string; value: string; from: string };

export type TransitException = {
  severity: "info" | "caution" | "high";
  title: string;
  detail: string;
  stepNum: number | null;
  /** Compliance questions belong to the Risk agent, not this one. */
  handOff?: "risk";
};

export type TransitCapacity = {
  tonnes: number | null;
  grossTonnes: number | null;
  units: Units;
  /** Transport units the case itself states (intake or the trader's own value). */
  declared: number | null;
  equipment: string;
  /** Tonnes per unit at the planned load. */
  loadPerUnitT: number | null;
  limitPerUnitT: number;
};

export type TransitStatus = {
  milestone: Milestone;
  label: string;
  reachedStep: number | null;
  at: string | null;
  /** The step the movement is waiting on next, if any. */
  next: { stepNum: number; title: string; lane: string; state: string; entity: string } | null;
  done: number;
  total: number;
};

export type TransitView = {
  caseId: string;
  mode: string;
  goods: string;
  capacity: TransitCapacity;
  route: {
    origin: string;
    destination: string;
    via: string[];
    borders: number;
    distanceKm: number | null;
    transitHours: [number, number] | null;
    gaugeBreak: string | null;
  } | null;
  legs: TransitLeg[];
  status: TransitStatus;
  references: TransitReference[];
  exceptions: TransitException[];
};

/** Rail wagons are refused over this load by the railway's own rules (apps/portals). */
const WAGON_LIMIT_T = 68;
const LIMIT_PER_UNIT: Record<string, number> = { train: WAGON_LIMIT_T, road: 24, air: 3 };

const isDone = (node: WorkflowNodeRecord | undefined) => node?.state === "completed" || node?.state === "skipped";

const stepsOf = (procedure: Procedure): ProcedureStep[] => procedure.blocks.flatMap((b) => b.steps).sort((a, b) => a.num - b.num);

/** Which milestone a step marks, if any. */
export function milestoneOfStep(step: Pick<ProcedureStep, "title" | "entity" | "channel">): Milestone | null {
  const title = (step as { publishedTitle?: string }).publishedTitle ?? step.title;
  for (const rule of MILESTONE_RULES) {
    if (rule.title.test(title) && (!rule.entity || rule.entity.test(step.entity))) return rule.milestone;
  }
  return null;
}

/* ------------------------------------------------------------- capacity --- */

function declaredUnits(ledger: Ledger, facts: ShipmentFacts): number | null {
  const typed = ledger.inputs.get(inputKey("value", 0, "Quantity of transport units"))?.value;
  const fromInput = typed ? Number(typed.replace(/[^\d.]/g, "")) : NaN;
  if (Number.isFinite(fromInput) && fromInput > 0) return fromInput;
  // "2 wagons" said at intake is itself a unit count.
  if (facts.quantity && /^(wagon|railcar|truck|lorr|fura|trailer|container|pallet)/i.test(facts.unit ?? "")) return facts.quantity;
  return null;
}

function equipmentFor(goods: string, mode: string, units: Units): string {
  if (/refrigerated/i.test(units.kind)) return "Refrigerated (reefer) — the cargo is perishable";
  if (/fresh fruit|vegetable|juice|tea/i.test(goods) && mode === "road") return "Ventilated or temperature-controlled body";
  if (mode === "air") return "Air pallets (ULD), temperature-kept warehouse";
  if (/fertili[sz]er|manure/i.test(goods)) return "Covered wagon, lined for bulk organic cargo";
  return `${units.kind[0].toUpperCase()}${units.kind.slice(1)} — dry cargo`;
}

/* ------------------------------------------------------------ references --- */

const DOC_REFERENCES: { docType: string; key: string; label: string }[] = [
  { docType: "railway_bill", key: "dispatch_no", label: "Dispatch number (SMGS)" },
  { docType: "railway_bill", key: "wagon_no", label: "Wagon number" },
  { docType: "railway_bill", key: "seals", label: "Seals" },
  { docType: "cmr_note", key: "cmr_no", label: "CMR number" },
  { docType: "cmr_note", key: "vehicle", label: "Vehicle registration" },
  { docType: "air_waybill", key: "awb_no", label: "Air waybill" },
  { docType: "air_waybill", key: "flight_date", label: "Flight / date" },
  { docType: "cargo_transport_application", key: "wagons", label: "Wagons applied for" },
];

/** Every transport reference the case holds: from the documents read and from
 *  what the carrier's API issued. */
export function transitReferences(ledger: Ledger, records: PortalRecord[]): TransitReference[] {
  const out: TransitReference[] = [];
  const push = (label: string, value: string | null | undefined, from: string) => {
    const clean = (value ?? "").trim();
    if (!clean || out.some((r) => r.label === label && r.value === clean)) return;
    out.push({ label, value: clean, from });
  };
  for (const doc of ledger.documents) {
    for (const ref of DOC_REFERENCES) {
      if (doc.docType !== ref.docType) continue;
      const field = doc.fields.find((f) => f.key === ref.key && f.value && (doc.confirmed || f.status === "accepted" || f.status === "confirmed"));
      push(ref.label, field?.value, `${doc.label}, step ${doc.stepNum}`);
    }
  }
  for (const record of records) {
    if (record.entity !== "railway" && record.entity !== "customs") continue;
    if (record.status !== "approved") continue;
    push(`${record.serviceTitle} reference`, record.reference, `${record.entityName}, step ${record.stepNum}`);
    for (const [key, value] of Object.entries(record.outputs)) {
      if (/wagon|train|flight|vehicle|dispatch|slot|plan_no|certificate/i.test(key)) {
        push(key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), value, `${record.entityName}, step ${record.stepNum}`);
      }
    }
  }
  return out;
}

/* --------------------------------------------------------------- status --- */

function buildStatus(procedure: Procedure, nodes: Map<number, WorkflowNodeRecord>, completedAt: Map<string, string>): TransitStatus {
  const steps = stepsOf(procedure);
  const marked = steps.map((step) => ({ step, milestone: milestoneOfStep(step) })).filter((m): m is { step: ProcedureStep; milestone: Milestone } => Boolean(m.milestone));

  let reached: Milestone = "planned";
  let reachedStep: number | null = null;
  let at: string | null = null;
  for (const { step, milestone } of marked) {
    const node = nodes.get(step.num);
    if (!isDone(node)) continue;
    if (MILESTONES.indexOf(milestone) >= MILESTONES.indexOf(reached)) {
      reached = milestone;
      reachedStep = step.num;
      at = (node && completedAt.get(node.id)) ?? null;
    }
  }

  const pending = marked.find(({ step }) => !isDone(nodes.get(step.num)));
  const node = pending ? nodes.get(pending.step.num) : undefined;
  const next = pending
    ? {
        stepNum: pending.step.num,
        title: pending.step.title,
        lane: node?.lane ?? delegationOfStep(pending.step).lane,
        state: node?.state ?? "waiting",
        entity: pending.step.entity,
      }
    : null;

  return {
    milestone: reached,
    label: MILESTONE_LABEL[reached],
    reachedStep,
    at,
    next,
    done: marked.filter(({ step }) => isDone(nodes.get(step.num))).length,
    total: marked.length,
  };
}

/* ----------------------------------------------------------------- legs --- */

function buildLegs(procedure: Procedure, nodes: Map<number, WorkflowNodeRecord>, origin: string, destination: string, via: string[]): TransitLeg[] {
  const steps = stepsOf(procedure);
  const physical = steps.filter((s) => delegationOfStep(s).lane === "physical");
  const pick = (re: RegExp) => physical.filter((s) => re.test(s.title));

  const plan: { id: string; title: string; place: string; match: RegExp }[] = [
    { id: "origin", title: "Cargo made ready", place: origin, match: /place cargo|prepare|deliver the|receive|weigh/i },
    { id: "inspect", title: "Inspection at the goods", place: origin, match: /inspect|sampl|fumigat|undergo/i },
    { id: "load", title: "Loading", place: origin, match: /\bload/i },
    { id: "seal", title: "Sealing and dispatch", place: origin, match: /seal|dispatch|hand ?over/i },
    { id: "border", title: "Border crossing", place: via.length ? `${via.map(countryName).join(" → ")}` : "Border", match: /border|crossing/i },
    { id: "clear", title: "Customs control", place: destination, match: /customs/i },
    { id: "arrive", title: "Arrival and unloading", place: destination, match: /arriv|unload|deliver(ed)? to/i },
  ];

  return plan.map((leg) => {
    const legSteps = pick(leg.match).map((s) => s.num);
    const done = legSteps.length > 0 && legSteps.every((num) => isDone(nodes.get(num)));
    const started = legSteps.some((num) => {
      const node = nodes.get(num);
      return isDone(node) || node?.state === "running" || node?.state === "needs_input";
    });
    return { id: leg.id, title: leg.title, place: leg.place, state: done ? "done" : started ? "active" : "waiting", steps: legSteps };
  });
}

/* ----------------------------------------------------------- exceptions --- */

/** Transport services: a refusal here stops the cargo moving. */
const TRANSPORT_SERVICE = /railway|freight|wagon|loading|carriage|transport/i;

function buildExceptions(input: {
  procedure: Procedure;
  capacity: TransitCapacity;
  status: TransitStatus;
  references: TransitReference[];
  records: PortalRecord[];
  planNotes: { tone: "info" | "caution" | "high"; text: string }[];
  route: TransitView["route"];
}): TransitException[] {
  const { capacity, status, references, records, planNotes, route } = input;
  const out: TransitException[] = [];

  if (capacity.declared != null && capacity.declared !== capacity.units.count) {
    out.push({
      severity: "caution",
      title: "Capacity does not match the load",
      detail: `The case states ${capacity.declared} transport unit${capacity.declared === 1 ? "" : "s"}, but ${capacity.tonnes != null ? fmtTonnes(capacity.tonnes) : "this load"} needs ${capacity.units.count} ${capacity.units.kind}${capacity.units.count === 1 ? "" : "s"} at ~${capacity.units.perUnitT} t each. The railway refuses an application that overloads a wagon.`,
      stepNum: null,
    });
  }
  if (capacity.loadPerUnitT != null && capacity.loadPerUnitT > capacity.limitPerUnitT) {
    out.push({
      severity: "high",
      title: "Over the load limit per unit",
      detail: `${capacity.loadPerUnitT.toFixed(1)} t per ${capacity.units.kind} is over the ${capacity.limitPerUnitT} t limit — order ${Math.ceil((capacity.tonnes ?? 0) / capacity.limitPerUnitT)} units or the carrier will refuse the booking.`,
      stepNum: null,
    });
  }

  for (const record of records) {
    if (!TRANSPORT_SERVICE.test(`${record.serviceTitle} ${record.entityName}`)) continue;
    if (record.status === "rejected" || record.status === "changes_requested") {
      out.push({
        severity: "high",
        title: `${record.entityName} is holding the booking`,
        detail: `${record.serviceTitle}: ${record.flags.map((f) => `${f.label} — ${f.reason}`).join("; ") || record.message}`,
        stepNum: record.stepNum,
      });
    } else if (record.status === "under_review") {
      out.push({
        severity: "info",
        title: "Capacity request under review",
        detail: `${record.entityName} is reviewing ${record.serviceTitle}${record.reference ? ` (${record.reference})` : ""} — the movement waits on its answer.`,
        stepNum: record.stepNum,
      });
    }
  }

  const movementIndex = MILESTONES.indexOf(status.milestone);
  const hasUnitNumbers = references.some((r) => /wagon|vehicle|flight|dispatch/i.test(r.label));
  if (movementIndex >= MILESTONES.indexOf("loaded") && !hasUnitNumbers) {
    out.push({
      severity: "caution",
      title: "No transport unit numbers recorded",
      detail: "The cargo is loaded but no wagon, vehicle or flight number is in the case — the consignment can't be tracked or matched to the transport document.",
      stepNum: status.reachedStep,
    });
  }

  if (status.next && status.next.state === "needs_input" && status.next.lane !== "agent") {
    out.push({
      severity: "caution",
      title: "Movement is waiting on you",
      detail: `Step ${status.next.stepNum} — ${status.next.title} (${status.next.entity}) has to be done before the cargo moves further.`,
      stepNum: status.next.stepNum,
    });
  }

  if (route && route.gaugeBreak) {
    out.push({ severity: "caution", title: "Break of gauge on the route", detail: `${route.gaugeBreak} — the cargo is transshipped or the bogies are changed; allow for the extra handling.`, stepNum: null });
  }

  // Movement-related plan notes (cold chain, wagon economics, ferry legs).
  for (const note of planNotes) {
    if (!/reefer|cold chain|shelf life|transit|wagon|freighter|ferry|gauge|groupage|belly/i.test(note.text)) continue;
    const title = /cold chain|shelf life|reefer/i.test(note.text)
      ? "Cold chain"
      : /gauge|ferry|corridor|border/i.test(note.text)
        ? "Route condition"
        : /freighter|belly|groupage|wagon/i.test(note.text)
          ? "Capacity note"
          : "Transit condition";
    out.push({
      severity: note.tone,
      title,
      detail: note.text,
      stepNum: null,
      ...(/shelf life|cold chain/i.test(note.text) ? { handOff: "risk" as const } : {}),
    });
  }

  const order = { high: 0, caution: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

/* ----------------------------------------------------------------- view --- */

export function transitView(input: {
  caseId: string;
  procedure: Procedure;
  facts: ShipmentFacts;
  query?: string;
  projection: WorkflowProjection;
  ledger: Ledger;
}): TransitView {
  const { caseId, procedure, facts, query = "", projection, ledger } = input;
  const nodes = new Map(projection.nodes.map((n) => [n.stepNum, n]));
  const records = [...latestRecords(projection).values()];

  const plan = buildShipmentPlan(procedure, facts, query);
  const tonnes = plan.tonnes ?? toTonnes(facts.quantity, facts.unit, procedure.goods);
  const units = plan.units ?? unitsFor(procedure.mode, procedure.goods, tonnes);
  const declared = declaredUnits(ledger, facts);
  const limit = LIMIT_PER_UNIT[procedure.mode] ?? units.perUnitT;

  const capacity: TransitCapacity = {
    tonnes,
    grossTonnes: tonnes == null ? null : Math.round(tonnes * 1.02 * 1000) / 1000,
    units,
    declared,
    equipment: equipmentFor(procedure.goods, procedure.mode, units),
    loadPerUnitT: tonnes == null ? null : Math.round((tonnes / Math.max(1, declared ?? units.count)) * 10) / 10,
    limitPerUnitT: limit,
  };

  const route: TransitView["route"] = plan.route
    ? {
        origin: plan.route.origin.place.name,
        destination: plan.route.destination.place.name,
        via: plan.route.via,
        borders: plan.route.borders,
        distanceKm: Math.round(plan.route.distanceKm),
        transitHours: plan.route.transit,
        gaugeBreak: plan.route.gaugeBreak,
      }
    : null;

  // A node carries no completion time; the ledger's audit trail does.
  const completedAt = new Map<string, string>();
  for (const event of projection.auditEvents) {
    if (!event.nodeId || !event.at) continue;
    if (/completed/.test(event.eventType)) completedAt.set(event.nodeId, event.at);
  }
  const status = buildStatus(procedure, nodes, completedAt);
  const references = transitReferences(ledger, records);
  const legs = buildLegs(procedure, nodes, route?.origin ?? facts.origin ?? "Origin", route?.destination ?? facts.destination ?? "Destination", route?.via ?? []);

  return {
    caseId,
    mode: procedure.mode,
    goods: procedure.goods,
    capacity,
    route,
    legs,
    status,
    references,
    exceptions: buildExceptions({ procedure, capacity, status, references, records, planNotes: plan.notes, route }),
  };
}
