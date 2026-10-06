/* The contract every entity API speaks.
 *
 * A trader's agent - or a person with curl - reads a service's published
 * fields and files an application. The entity answers the way its portal
 * would: 422 with the fields that are missing or invalid, or an application
 * under review that later comes back approved (with what the entity issued)
 * or with changes its reviewer requests, which the applicant amends.
 *
 * The web app keeps its own copy of the wire types in
 * apps/web/modules/portals/contract.ts. */

/** account: a 20-digit settlement account; mfo: a bank's 5-digit code. */
export type FieldType = "text" | "number" | "integer" | "date" | "enum" | "inn" | "phone" | "email" | "hs" | "country" | "reference" | "account" | "mfo";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  hint?: string;
  options?: string[];
  min?: number;
  max?: number;
  /** hs: how many digits this entity needs. */
  digits?: number;
  /** reference: the service whose approved application it names, "<entity>/<service>". */
  refService?: string;
  /** Asked only when another field holds this value. */
  when?: { field: string; equals: string };
};

export type FlagKind = "missing" | "invalid" | "change";

/** One field the entity won't take as it is, and why. */
export type Flag = { field: string; label: string; kind: FlagKind; reason: string; value: string | null };

export type ApplicationStatus = "under_review" | "changes_requested" | "approved";

export type HistoryEntry = { at: string; status: ApplicationStatus; revision: number; by: "applicant" | "rules" | "officer"; note: string };

export type Application = {
  id: string;
  reference: string;
  entity: string;
  service: string;
  status: ApplicationStatus;
  revision: number;
  fields: Record<string, string>;
  changes: Flag[];
  outputs: Record<string, string>;
  caseRef: string | null;
  idempotencyKey: string | null;
  submittedAt: string;
  updatedAt: string;
  history: HistoryEntry[];
};

export type ReviewContext = {
  now: Date;
  /** Any application in the registry, by reference number - entities check each other's documents. */
  find: (reference: string) => Application | undefined;
  /** Every application in the registry - the payment gateway looks for an earlier payment of the same document. */
  all: () => Application[];
};

export type ReviewFlag = { field: string; reason: string };

export type ServiceDef = {
  id: string;
  title: string;
  kind: "apply" | "obtain";
  description: string;
  fields: FieldDef[];
  /** What the entity's reviewer checks once the form itself is accepted. */
  review?: (fields: Record<string, string>, ctx: ReviewContext) => ReviewFlag[];
  /** What the entity issues when it approves. */
  issue: (application: Application, ctx: ReviewContext) => Record<string, string>;
};

export type EntityDef = {
  id: string;
  name: string;
  /** The real portal this sandbox stands in for. */
  site: string;
  /** Reference numbers read <prefix>-<year>-<sequence>. */
  prefix: string;
  /** Environment variable holding this entity's API key. */
  keyEnv: string;
  /** Accepted when no key is configured. */
  devKey: string;
  services: ServiceDef[];
};

/** A reference number issued by this registry. */
export const REFERENCE = /^[A-Z]{2}-\d{4}-\d{6}$/;
