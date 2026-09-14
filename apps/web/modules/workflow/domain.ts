import { delegationOfStep, type Lane } from "../procedures/delegation";
import type { Procedure } from "../procedures/data/procedures.generated";

export type ShipmentFacts = {
  goods: string;
  quantity: number | null;
  unit: string | null;
  origin: string | null;
  destination: string | null;
  mode: string | null;
};

export type WorkflowNodeState =
  | "waiting"
  | "ready"
  | "running"
  | "needs_input"
  | "completed"
  | "failed"
  | "skipped";

export type WorkflowNodeDefinition = {
  id: string;
  runId: string;
  blockId: string;
  blockName: string;
  stepNum: number;
  title: string;
  output: string;
  entityName: string;
  channel: string;
  lane: Lane;
  delegationReason: string;
  optional: boolean;
  state: WorkflowNodeState;
};

export type WorkflowEdgeDefinition = {
  runId: string;
  fromNodeId: string;
  toNodeId: string;
  reason: string;
};

export type InstantiatedWorkflow = {
  nodes: WorkflowNodeDefinition[];
  edges: WorkflowEdgeDefinition[];
};

const cleanPlace = (value: string | undefined) => value?.trim().replace(/[.,;]+$/, "") || null;

/* Casual phrasing: "20t", "20 mt", "20,000 kg", "3 wagons", "2 containers". */
const QUANTITY_UNIT = String.raw`tonnes?|tons?|mt|t|kilograms?|kgs?|kg|wagons?|railcars?|containers?`;
const NUMBER = String.raw`\d[\d,]*(?:\.\d+)?`;
const QUANTITY = new RegExp(String.raw`\b(${NUMBER})\s*(${QUANTITY_UNIT})\b`, "i");
const QUANTITY_PREFIX = new RegExp(String.raw`^${NUMBER}\s*(?:${QUANTITY_UNIT})\s+(?:of\s+)?`, "i");
const MODE_TAIL = String.raw`(?:\s+(?:by|via)\s+(?:train|rail|air|road|truck)|[.,;!?]|$)`;
const FROM_TO = new RegExp(String.raw`\bfrom\s+(.+?)\s+to\s+(.+?)${MODE_TAIL}`, "i");
const TO_FROM = new RegExp(String.raw`\bto\s+(.+?)\s+from\s+(.+?)${MODE_TAIL}`, "i");

const VERB_START = /^(?:move|ship|send|export|import|bring|transport|carry|deliver|get|take|buy|sell|have)\b/i;

export function extractShipmentFacts(query: string): ShipmentFacts {
  const quantityMatch = query.match(QUANTITY);
  // "from X to Y", or the other way round: "to Y from X".
  const fromTo = query.match(FROM_TO);
  // "want to move tea from X" is an infinitive, not a destination.
  const toFromRaw = fromTo ? null : query.match(TO_FROM);
  const toFrom = toFromRaw && !VERB_START.test(toFromRaw[1]) ? toFromRaw : null;
  const goodsMatch = query.match(/\b(?:of|move|ship|send|export|import)\s+(.+?)\s+(?:from|to|by|via)\b/i);
  const modeMatch = query.match(/\b(?:by|via)\s+(train|rail|air|road|truck)\b/i);
  const mode = modeMatch?.[1].toLowerCase();

  return {
    goods: (goodsMatch?.[1] ?? "").replace(QUANTITY_PREFIX, "").trim().toLowerCase(),
    quantity: quantityMatch ? Number(quantityMatch[1].replace(/,/g, "")) : null,
    unit: quantityMatch?.[2].toLowerCase() ?? null,
    origin: cleanPlace(fromTo?.[1] ?? toFrom?.[2]),
    destination: cleanPlace(fromTo?.[2] ?? toFrom?.[1]),
    mode: mode === "rail" ? "train" : mode === "truck" ? "road" : mode ?? null,
  };
}

export function validateProcedure(procedure: Procedure): void {
  if (!procedure.id.trim() || !procedure.title.trim()) throw new Error("Procedure id and title are required");
  const blockIds = new Set<string>();
  const stepNums = new Set<number>();

  for (const block of procedure.blocks) {
    if (blockIds.has(block.id)) throw new Error(`Duplicate block id: ${block.id}`);
    blockIds.add(block.id);
    for (const step of block.steps) {
      if (stepNums.has(step.num)) throw new Error(`Duplicate step number: ${step.num}`);
      stepNums.add(step.num);
    }
  }

  for (const block of procedure.blocks) {
    for (const dependency of block.dependsOn) {
      if (!blockIds.has(dependency)) throw new Error(`Missing dependency ${dependency} for block ${block.id}`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(procedure.blocks.map((block) => [block.id, block]));
  const visit = (blockId: string) => {
    if (visiting.has(blockId)) throw new Error(`Procedure dependency cycle detected at ${blockId}`);
    if (visited.has(blockId)) return;
    visiting.add(blockId);
    for (const dependency of byId.get(blockId)?.dependsOn ?? []) visit(dependency);
    visiting.delete(blockId);
    visited.add(blockId);
  };
  for (const block of procedure.blocks) visit(block.id);
}

export function instantiateWorkflow(procedure: Procedure, runId: string): InstantiatedWorkflow {
  validateProcedure(procedure);
  const nodes: WorkflowNodeDefinition[] = [];
  const edges: WorkflowEdgeDefinition[] = [];
  const blockNodes = new Map<string, WorkflowNodeDefinition[]>();

  for (const block of procedure.blocks) {
    const ordered = [...block.steps].sort((a, b) => a.num - b.num);
    const created = ordered.map((step) => {
      const delegation = delegationOfStep(step);
      return {
        id: `${runId}:${block.id}:${step.num}`,
        runId,
        blockId: block.id,
        blockName: block.name,
        stepNum: step.num,
        title: step.title,
        output: step.output,
        entityName: step.entity,
        channel: step.channel,
        lane: delegation.lane,
        delegationReason: delegation.reason,
        optional: step.optional,
        state: "waiting" as const,
      };
    });
    blockNodes.set(block.id, created);
    nodes.push(...created);

    for (let index = 1; index < created.length; index++) {
      edges.push({
        runId,
        fromNodeId: created[index - 1].id,
        toNodeId: created[index].id,
        reason: `Published step order within ${block.name}.`,
      });
    }
  }

  for (const block of procedure.blocks) {
    const first = blockNodes.get(block.id)?.[0];
    if (!first) continue;
    for (const dependencyId of block.dependsOn) {
      const dependencyNodes = blockNodes.get(dependencyId) ?? [];
      const last = dependencyNodes[dependencyNodes.length - 1];
      if (!last) continue;
      edges.push({
        runId,
        fromNodeId: last.id,
        toNodeId: first.id,
        reason: block.dependencyReason || `${block.name} depends on ${dependencyId}.`,
      });
    }
  }

  const incoming = new Set(edges.map((edge) => edge.toNodeId));
  for (const node of nodes) if (!incoming.has(node.id)) node.state = "ready";
  return { nodes, edges };
}

export function reconcileNodes(
  nodes: WorkflowNodeDefinition[],
  edges: WorkflowEdgeDefinition[],
): WorkflowNodeDefinition[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return nodes.map((node) => {
    if (node.state !== "waiting") return node;
    const predecessors = edges.filter((edge) => edge.toNodeId === node.id);
    const ready = predecessors.every((edge) => {
      const state = byId.get(edge.fromNodeId)?.state;
      return state === "completed" || state === "skipped";
    });
    return ready ? { ...node, state: "ready" } : node;
  });
}
