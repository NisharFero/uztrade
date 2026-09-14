import type { WorkflowNodeRecord, WorkflowProjection } from "./repository";

export function deriveBlockProgress(nodes: WorkflowNodeRecord[]): Record<string, "waiting" | "running" | "done"> {
  const grouped = new Map<string, WorkflowNodeRecord[]>();
  for (const node of nodes) grouped.set(node.blockId, [...(grouped.get(node.blockId) ?? []), node]);
  return Object.fromEntries([...grouped].map(([blockId, blockNodes]) => {
    const done = blockNodes.every((node) => node.state === "completed" || node.state === "skipped");
    const active = blockNodes.some((node) => node.state !== "waiting");
    return [blockId, done ? "done" : active ? "running" : "waiting"];
  }));
}

export function buildDagProjection(projection: WorkflowProjection) {
  const completed = projection.nodes.filter((node) => node.state === "completed" || node.state === "skipped").length;
  const total = projection.nodes.length;
  const openWorkByNode = new Map(
    projection.workItems
      .filter((item) => item.state === "open")
      .map((item) => [item.nodeId, item]),
  );
  const currentNode = [...projection.nodes]
    .sort((a, b) => a.stepNum - b.stepNum)
    .find((node) => node.state === "needs_input" || node.state === "running" || node.state === "ready");

  return {
    run: {
      id: projection.run.id,
      caseId: projection.run.caseId,
      procedureVersionId: projection.run.procedureVersionId,
      status: projection.run.status,
    },
    shipment: projection.shipmentFacts,
    current: currentNode ? {
      nodeId: currentNode.id,
      blockId: currentNode.blockId,
      stepNum: currentNode.stepNum,
      title: currentNode.title,
      lane: currentNode.lane,
      state: currentNode.state,
    } : null,
    progress: {
      completed,
      total,
      percent: total ? Math.round((completed / total) * 100) : 100,
    },
    nodes: projection.nodes
      .sort((a, b) => a.stepNum - b.stepNum)
      .map((node) => {
        const work = openWorkByNode.get(node.id);
        return {
          id: node.id,
          blockId: node.blockId,
          blockName: node.blockName,
          stepNum: node.stepNum,
          title: node.title,
          state: node.state,
          lane: node.lane,
          reason: node.delegationReason,
          assignedTo: node.lane === "agent" ? "agent" : node.assignedUserId ?? node.assignedEntityId ?? null,
          action: work ? { workItemId: work.id, kind: "complete_mock" as const } : null,
        };
      }),
    edges: projection.edges.map((edge) => ({
      from: edge.fromNodeId,
      to: edge.toNodeId,
      reason: edge.reason,
    })),
  };
}
