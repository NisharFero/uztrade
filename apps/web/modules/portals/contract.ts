/* The wire types of the entity APIs (apps/portals/src/contract.ts), as the
 * agent reads them. Kept as a copy so the worker bundle doesn't reach into
 * another app. */

export type PortalEntityId =
  | "single-window"
  | "railway"
  | "customs"
  | "assalom-agro"
  | "expertiza"
  | "payments"
  | "e-tranzit"
  | "sanitary"
  | "medicines"
  | "ecology"
  | "cargo-agent"
  | "edocs";

export type FieldType = "text" | "number" | "integer" | "date" | "enum" | "inn" | "phone" | "email" | "hs" | "country" | "reference" | "account" | "mfo";

export type PortalField = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  hint?: string;
  options?: string[];
  min?: number;
  max?: number;
  digits?: number;
  refService?: string;
  when?: { field: string; equals: string };
};

export type PortalService = {
  entity: PortalEntityId;
  entityName: string;
  id: string;
  ref: string;
  title: string;
  kind: "apply" | "obtain";
  description: string;
  fields: PortalField[];
};

export type FlagKind = "missing" | "invalid" | "change";
export type PortalFlag = { field: string; label: string; kind: FlagKind; reason: string; value: string | null };

export type ApplicationStatus = "under_review" | "changes_requested" | "approved";

export type PortalApplication = {
  id: string;
  reference: string;
  entity: PortalEntityId;
  entityName: string;
  service: string;
  serviceTitle: string;
  status: ApplicationStatus;
  revision: number;
  fields: Record<string, string>;
  changes: PortalFlag[];
  outputs: Record<string, string>;
  reviewDueAt: string | null;
  updatedAt: string;
};

export type PortalRejection = {
  status: "rejected";
  message: string;
  missing: PortalFlag[];
  invalid: PortalFlag[];
  id?: string;
  reference?: string;
};
