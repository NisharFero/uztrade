/* What each entity said about the case's applications, kept on the workflow
 * run as versioned artifacts (like the trader's ledger): every submission,
 * rejection, change request and approval is a new version, the latest per
 * step is where the step stands with its entity. */

import type { WorkflowProjection } from "../workflow/repository";
import type { FieldType, PortalEntityId, PortalFlag } from "./contract";
import type { FixSuggestion } from "./fixes";

export const PORTAL_ARTIFACT = "portal_application";

export type PortalStatus = "rejected" | "under_review" | "changes_requested" | "approved";

/** A flagged field, with what the agent needs to look its value up again and the help worked out for it. */
export type FlaggedField = PortalFlag & {
  type: FieldType;
  refService: string | null;
  options: string[];
  /** hs: the digits the entity needs. */
  digits: number | null;
  /** Values that would fix it (fixes.ts). */
  suggestions: FixSuggestion[];
  /** Why, in plain words - written by a model when one is allowed. */
  explanation: string | null;
};

export type PortalRecord = {
  stepNum: number;
  nodeId: string;
  entity: PortalEntityId;
  entityName: string;
  /** "<entity>/<service>" */
  service: string;
  serviceTitle: string;
  applicationId: string | null;
  reference: string | null;
  status: PortalStatus;
  revision: number;
  /** The fields as sent (or as the entity stored them). */
  submitted: Record<string, string>;
  flags: FlaggedField[];
  outputs: Record<string, string>;
  message: string;
  version: number;
  at: string;
};

/** A step's standing with its entity, as the assistant shows it. */
export type PortalView = {
  stepNum: number;
  stepTitle: string;
  entity: PortalEntityId;
  entityName: string;
  serviceTitle: string;
  reference: string | null;
  status: PortalStatus;
  revision: number;
  flags: { label: string; kind: PortalFlag["kind"]; reason: string }[];
  outputs: Record<string, string>;
  message: string;
  at: string;
};

export function portalRecords(projection: Pick<WorkflowProjection, "artifacts">): PortalRecord[] {
  return projection.artifacts
    .filter((artifact) => artifact.type === PORTAL_ARTIFACT)
    .map((artifact) => artifact.data as unknown as PortalRecord)
    .filter((record) => record?.service)
    .sort((a, b) => a.version - b.version);
}

/** The latest record per step. */
export function latestRecords(projection: Pick<WorkflowProjection, "artifacts">): Map<number, PortalRecord> {
  const latest = new Map<number, PortalRecord>();
  for (const record of portalRecords(projection)) latest.set(record.stepNum, record);
  return latest;
}

export function portalView(record: PortalRecord, stepTitle: string): PortalView {
  return {
    stepNum: record.stepNum,
    stepTitle,
    entity: record.entity,
    entityName: record.entityName,
    serviceTitle: record.serviceTitle,
    reference: record.reference,
    status: record.status,
    revision: record.revision,
    flags: record.flags.map((f) => ({ label: f.label, kind: f.kind, reason: f.reason })),
    outputs: record.outputs,
    message: record.message,
    at: record.at,
  };
}
