import type { Procedure } from "../procedures/data/procedures.generated";
import type { ShipmentFacts, WorkflowNodeDefinition } from "./domain";
import { assessCompliance } from "../compliance/compliance";
import { specFor, type DocType } from "../documents/specs";
import { allInputs, stepNeeds, waitingOn } from "../procedures/requirements";
import { runAgenticAiTask, type AgenticAiClient } from "./agentic-ai";
import { toTonnes, unitsFor } from "../intake/shipment-plan";
import { milestoneOfStep, MILESTONE_LABEL } from "../transit/transit";

export type SpecialistName = "document_intelligence" | "compliance_risk" | "inspection_scheduler" | "transit_capacity" | "procedure_executor";

export type SpecialistResult = {
  agent: SpecialistName;
  artifactType: string;
  name: string;
  simulated: true;
  data: Record<string, unknown>;
};

export type SpecialistContext = {
  /** The published procedure the run is pinned to, when it is one of ours. */
  procedure?: Procedure;
  /** Step numbers already completed or skipped in this run. */
  completedSteps?: ReadonlySet<number>;
  /** Optional Groq/Hugging Face providers for agentic task summaries/evidence. */
  ai?: AgenticAiClient;
};

export function specialistFor(node: WorkflowNodeDefinition): SpecialistName {
  const text = `${node.title} ${node.output} ${node.entityName}`;
  if (/schedule|appointment|book.*inspection/i.test(text)) return "inspection_scheduler";
  // Movement and capacity: wagons, freight, loading and dispatch — but a step
  // whose point is a document stays with Document Intelligence.
  if (/wagon|freight|carriage|loading|dispatch|transport unit|cost calculation/i.test(text) && !/certificate|declaration|bill|invoice|document|permit/i.test(text)) {
    return "transit_capacity";
  }
  if (/\bhs\b|duty|tariff|risk|customs fee|classification/i.test(text)) return "compliance_risk";
  if (node.output.trim() || /document|certificate|declaration|invoice|contract|permit/i.test(text)) return "document_intelligence";
  return "procedure_executor";
}

const hasStep = (procedure: Procedure | undefined, stepNum: number): procedure is Procedure =>
  Boolean(procedure?.blocks.some((b) => b.steps.some((s) => s.num === stepNum)));

export async function executeSpecialist(
  node: WorkflowNodeDefinition,
  facts: ShipmentFacts,
  context: SpecialistContext = {},
): Promise<SpecialistResult> {
  const agent = specialistFor(node);
  const common = { procedureStep: node.stepNum, goods: facts.goods, simulated: true };
  const { procedure, completedSteps = new Set<number>() } = context;

  if (agent === "compliance_risk") {
    const name = `Compliance assessment for step ${node.stepNum}`;
    if (procedure) {
      const a = assessCompliance(procedure, facts);
      const fallback = {
        ...common,
        ruleKey: a.ruleKey,
        hsCode: a.hsCode,
        hsHeading: a.hsHeading,
        riskFlags: a.riskFlags.map((f) => ({ label: f.label, severity: f.severity, evidence: f.evidence, advisory: Boolean(f.advisory) })),
        unresolved: a.unresolved,
        disclaimer: "Advisory. No duty rate is computed without Uzbekistan's tariff schedule.",
      };
      const ai = await runAgenticAiTask({
        task: "compliance_review",
        system: "You are the Compliance & Risk agent. Explain the deterministic rule-engine result without inventing duty rates, laws, or documents.",
        prompt: JSON.stringify({ step: node.stepNum, title: node.title, assessment: fallback }),
        fallback,
      }, context.ai);
      return {
        agent,
        artifactType: "compliance_assessment",
        name,
        simulated: true,
        data: ai.data,
      };
    }
    const ai = await runAgenticAiTask({
      task: "compliance_review",
      system: "You are the Compliance & Risk agent. Explain the mock assessment and say it must be verified.",
      prompt: JSON.stringify({ step: node.stepNum, title: node.title, facts }),
      fallback: { ...common, decision: "reviewed", disclaimer: "Mock assessment; verify against current Uzbekistan rules." },
    }, context.ai);
    return { agent, artifactType: "compliance_assessment", name, simulated: true, data: ai.data };
  }

  if (agent === "inspection_scheduler") return scheduleInspection(node, facts);

  if (agent === "transit_capacity") {
    // What this step does for the movement, and the capacity it is sized for.
    const mode = procedure?.mode ?? "train";
    const goods = procedure?.goods ?? facts.goods;
    const tonnes = toTonnes(facts.quantity, facts.unit, goods);
    const units = unitsFor(mode, goods, tonnes);
    const milestone = milestoneOfStep({ title: node.title, entity: node.entityName, channel: node.channel ?? "" });
    const fallback = {
      ...common,
      milestone,
      milestoneLabel: milestone ? MILESTONE_LABEL[milestone] : null,
      transportMode: mode,
      capacity: { units: units.count, kind: units.kind, perUnitT: units.perUnitT, tonnes, assumed: units.assumed },
      entity: node.entityName,
      note: "Capacity and movement only; the booking itself is filed with the carrier's API.",
    };
    const ai = await runAgenticAiTask({
      task: "transit_capacity",
      system: "You are the Transit & Capacity agent. Report transport capacity and movement state from the supplied data; never invent wagon numbers, schedules or bookings.",
      prompt: JSON.stringify({ step: node.stepNum, title: node.title, transit: fallback }),
      fallback,
    }, context.ai);
    return { agent, artifactType: "transit_step", name: `Transit — ${node.title}`, simulated: true, data: ai.data };
  }

  if (agent === "document_intelligence") {
    const name = node.output || `${node.title} result`;
    if (hasStep(procedure, node.stepNum)) {
      // What this step needs, and which earlier-step documents are not produced yet -
      // those become amendment requests rather than a silent "complete".
      const needs = stepNeeds(procedure, node.stepNum);
      const inputs = allInputs(needs);
      const missing = waitingOn(needs, (stepNum) => completedSteps.has(stepNum));
      const docTypes = [...new Set(inputs.map((i) => i.docType).filter((t): t is DocType => Boolean(t)))];
      const fallback = {
        ...common,
        completeness: missing.length ? "incomplete" : "complete",
        amendmentsRequested: missing.map((i) => ({ document: i.label, producedByStep: i.producedBy!.stepNum })),
        needs: inputs.map((i) => ({ label: i.label, kind: i.kind, optional: i.optional, producedByStep: i.producedBy?.stepNum ?? null })),
        variants: needs.variants.map((v) => ({ label: v.label, inputs: v.inputs.map((i) => i.label) })),
        checklists: docTypes.map((t) => {
          const spec = specFor(t);
          return { document: spec.name, fields: spec.fields.map((f) => f.name), checks: spec.checks };
        }),
        extracted: facts,
      };
      const ai = await runAgenticAiTask({
        task: "document_intelligence",
        system: "You are the Document Intelligence agent. Summarize document evidence and missing documents using only the supplied checklist.",
        prompt: JSON.stringify({ step: node.stepNum, title: node.title, checklist: fallback }),
        documents: docTypes.map((t) => specFor(t).name),
        fallback,
      }, context.ai);
      return {
        agent,
        artifactType: "document",
        name,
        simulated: true,
        data: ai.data,
      };
    }
    const ai = await runAgenticAiTask({
      task: "document_intelligence",
      system: "You are the Document Intelligence agent. Summarize document evidence using only the supplied step data.",
      prompt: JSON.stringify({ step: node.stepNum, title: node.title, facts }),
      documents: node.output ? [node.output] : [],
      fallback: { ...common, completeness: "complete", extracted: facts },
    }, context.ai);
    return { agent, artifactType: "document", name, simulated: true, data: ai.data };
  }

  const ai = await runAgenticAiTask({
    task: "procedure_execution",
    system: "You are the Procedure Executor agent. Summarize the portal or entity action without claiming legal authority.",
    prompt: JSON.stringify({ step: node.stepNum, title: node.title, entity: node.entityName, facts }),
    fallback: { ...common, status: "simulated_success" },
  }, context.ai);
  return { agent, artifactType: "execution_receipt", name: `${node.title} receipt`, simulated: true, data: ai.data };
}

export function scheduleInspection(node: WorkflowNodeDefinition, facts: ShipmentFacts): SpecialistResult {
  const seed = [...node.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const day = 12 + (seed % 10);
  return {
    agent: "inspection_scheduler",
    artifactType: "inspection_booking",
    name: `Mock inspection booking for step ${node.stepNum}`,
    simulated: true,
    data: { date: `2026-09-${String(day).padStart(2, "0")}`, window: "10:00-12:00", location: facts.origin ?? "Shipment location", entity: node.entityName, status: "scheduled", simulated: true },
  };
}
