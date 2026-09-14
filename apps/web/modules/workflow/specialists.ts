import type { Procedure } from "../procedures/data/procedures.generated";
import type { ShipmentFacts, WorkflowNodeDefinition } from "./domain";
import { assessCompliance } from "../compliance/compliance";
import { specFor, type DocType } from "../documents/specs";
import { allInputs, stepNeeds, waitingOn } from "../procedures/requirements";

export type SpecialistName = "document_intelligence" | "compliance_risk" | "inspection_scheduler" | "procedure_executor";

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
};

export function specialistFor(node: WorkflowNodeDefinition): SpecialistName {
  const text = `${node.title} ${node.output} ${node.entityName}`;
  if (/schedule|appointment|book.*inspection/i.test(text)) return "inspection_scheduler";
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
      return {
        agent,
        artifactType: "compliance_assessment",
        name,
        simulated: true,
        data: {
          ...common,
          ruleKey: a.ruleKey,
          hsCode: a.hsCode,
          hsHeading: a.hsHeading,
          riskFlags: a.riskFlags.map((f) => ({ label: f.label, severity: f.severity, evidence: f.evidence, advisory: Boolean(f.advisory) })),
          unresolved: a.unresolved,
          disclaimer: "Advisory. No duty rate is computed without Uzbekistan's tariff schedule.",
        },
      };
    }
    return { agent, artifactType: "compliance_assessment", name, simulated: true, data: { ...common, decision: "reviewed", disclaimer: "Mock assessment; verify against current Uzbekistan rules." } };
  }

  if (agent === "inspection_scheduler") return scheduleInspection(node, facts);

  if (agent === "document_intelligence") {
    const name = node.output || `${node.title} result`;
    if (hasStep(procedure, node.stepNum)) {
      // What this step needs, and which earlier-step documents are not produced yet -
      // those become amendment requests rather than a silent "complete".
      const needs = stepNeeds(procedure, node.stepNum);
      const inputs = allInputs(needs);
      const missing = waitingOn(needs, (stepNum) => completedSteps.has(stepNum));
      const docTypes = [...new Set(inputs.map((i) => i.docType).filter((t): t is DocType => Boolean(t)))];
      return {
        agent,
        artifactType: "document",
        name,
        simulated: true,
        data: {
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
        },
      };
    }
    return { agent, artifactType: "document", name, simulated: true, data: { ...common, completeness: "complete", extracted: facts } };
  }

  return { agent, artifactType: "execution_receipt", name: `${node.title} receipt`, simulated: true, data: { ...common, status: "simulated_success" } };
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
