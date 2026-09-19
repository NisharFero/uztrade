/* The Transit & Capacity agent's own record.
 *
 * After every orchestrator pass the agent looks at where the cargo stands and,
 * when the movement milestone has changed, writes it to the case: an artifact
 * holding the state (with the capacity it was planned against, the transport
 * references known at the time and the open movement exceptions) and one audit
 * event, so the ledger reads "Transit & Capacity agent — capacity confirmed".
 *
 * It never books anything: the entity APIs do that (modules/portals) and the
 * workflow owns the step states. This only reports. */

import type { Procedure } from "../procedures/data/procedures.generated";
import { buildLedger } from "../steps/ledger";
import { nextVersion } from "../steps/ledger";
import type { WorkflowProjection, WorkflowRepository } from "../workflow/repository";
import { transitView, type Milestone, type TransitView } from "./transit";

export const TRANSIT_ARTIFACT = "transit_state";
export const TRANSIT_AGENT = "transit_capacity";

export type TransitStateRecord = {
  milestone: Milestone;
  label: string;
  reachedStep: number | null;
  units: { required: number; declared: number | null; kind: string; equipment: string };
  references: { label: string; value: string }[];
  exceptions: { severity: string; title: string }[];
  version: number;
  at: string;
};

/** Every transit state this case has recorded, oldest first. */
export function transitStates(projection: WorkflowProjection): TransitStateRecord[] {
  return projection.artifacts
    .filter((a) => a.type === TRANSIT_ARTIFACT)
    .map((a) => a.data as unknown as TransitStateRecord)
    .sort((a, b) => a.version - b.version);
}

export const latestTransitState = (projection: WorkflowProjection): TransitStateRecord | null => transitStates(projection).at(-1) ?? null;

/** Records the movement state when it has moved on. Returns the new state, or
 *  null when nothing changed. */
export async function recordTransitState(
  repository: WorkflowRepository,
  projection: WorkflowProjection,
  procedure: Procedure,
  view?: TransitView,
): Promise<TransitStateRecord | null> {
  const runId = projection.run.id;
  const current =
    view ??
    transitView({
      caseId: projection.run.caseId,
      procedure,
      facts: projection.shipmentFacts,
      projection,
      ledger: buildLedger(projection.artifacts),
    });

  const previous = latestTransitState(projection);
  if (previous && previous.milestone === current.status.milestone) return null;

  const version = nextVersion();
  const state: TransitStateRecord = {
    milestone: current.status.milestone,
    label: current.status.label,
    reachedStep: current.status.reachedStep,
    units: {
      required: current.capacity.units.count,
      declared: current.capacity.declared,
      kind: current.capacity.units.kind,
      equipment: current.capacity.equipment,
    },
    references: current.references.map((r) => ({ label: r.label, value: r.value })),
    exceptions: current.exceptions.filter((e) => e.severity !== "info").map((e) => ({ severity: e.severity, title: e.title })),
    version,
    at: new Date().toISOString(),
  };

  await repository.addArtifact({
    id: `transit:${runId}:${version}`,
    runId,
    nodeId: null,
    type: TRANSIT_ARTIFACT,
    name: `Transit state — ${state.label}`,
    data: state as unknown as Record<string, unknown>,
    simulated: true,
  });
  await repository.addAudit({
    id: `audit-transit:${runId}:${version}`,
    runId,
    nodeId: null,
    eventType: "transit_state_changed",
    actorType: "agent",
    actorId: TRANSIT_AGENT,
    data: {
      milestone: state.milestone,
      label: state.label,
      step: state.reachedStep,
      units: `${state.units.declared ?? state.units.required} × ${state.units.kind}`,
      exceptions: state.exceptions.map((e) => e.title),
    },
  });
  return state;
}
