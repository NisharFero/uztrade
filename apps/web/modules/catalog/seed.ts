import { CATALOGUE } from "../procedures/data/procedures.generated";

export type SeedUser = {
  id: string;
  displayName: string;
  email: string;
  role: "trader" | "compliance_reviewer" | "finance_approver" | "operations_coordinator";
  capabilities: string[];
  status: "active";
};

export type SeedEntity = {
  id: string;
  canonicalName: string;
  type: EntityType;
  capabilities: string[];
  contact: { email: string; phone: string };
  simulationMode: true;
  status: "active";
};

export function mockUsers(): SeedUser[] {
  return [
    { id: "usr-trader", displayName: "Aziza Karimova", email: "aziza@uztrade.local", role: "trader", capabilities: ["sign", "submit", "provide_documents"], status: "active" },
    { id: "usr-compliance", displayName: "Bekzod Rakhimov", email: "bekzod@uztrade.local", role: "compliance_reviewer", capabilities: ["confirm_hs", "resolve_amendment"], status: "active" },
    { id: "usr-finance", displayName: "Dilnoza Saidova", email: "dilnoza@uztrade.local", role: "finance_approver", capabilities: ["approve_payment", "confirm_value"], status: "active" },
    { id: "usr-operations", displayName: "Timur Akhmedov", email: "timur@uztrade.local", role: "operations_coordinator", capabilities: ["coordinate", "attend", "confirm_handover"], status: "active" },
  ];
}

function slug(value: string): string {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

export type EntityType = "government" | "customs" | "inspection" | "certification" | "portal" | "bank" | "transport" | "facility" | "service";

/* What an entity is, from its name. Order matters: an online system is a
 * portal even when it belongs to an agency ("... Personal cabinet"), a customs
 * post is customs even at an airport warehouse, and a private provider is a
 * service even when its name says cargo or freight. The answer for every
 * entity the corpus names is hand-checked in evals/gold/entities.json. */
const ENTITY_RULES: [RegExp, EntityType][] = [
  [/online banking|\bbank\b/i, "bank"],
  [/personal cabinet|single window|single portal|service portal|web-?site|information system|document management|^assalom agro$|^darmon$/i, "portal"],
  [/customs post|border crossing/i, "customs"],
  [/broker|insurance|forwarding|sales agent/i, "service"],
  [/quarantine|sanitary|inspection|border checkpoint/i, "inspection"],
  [/expertiza|certificat|expertise and standardization|quality control/i, "certification"],
  [/warehouse|place of loading|location of goods|place of .* installation/i, "facility"],
  [/railway|temir yo'?llari|cargo|station|airport|transport/i, "transport"],
];

/** The corpus spells some names with typographic quotes and some without
 *  ("“Uzbekexpertiza” JSC" and "\"Uzbekexpertiza\" JSC"); both are one entity. */
export const entityName = (name: string) => name.trim().replace(/[“”„]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ");

export function entityType(name: string): EntityType {
  return ENTITY_RULES.find(([re]) => re.test(name.trim()))?.[1] ?? "government";
}

export function mockEntities(): SeedEntity[] {
  // The catalogue already lists every entity each procedure names, so seeding
  // the directory needs no workflow files.
  const names = [...new Set(Object.values(CATALOGUE).flatMap((procedure) => procedure.entities.map(entityName)))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  return names.map((canonicalName) => {
    const type = entityType(canonicalName);
    return {
      id: `ent-${slug(canonicalName)}`,
      canonicalName,
      type,
      capabilities: [type === "inspection" ? "perform_inspection" : type === "bank" ? "accept_payment" : "complete_procedure_step"],
      contact: { email: `${slug(canonicalName)}@mock.uztrade.local`, phone: "+998 00 000 0000" },
      simulationMode: true,
      status: "active",
    };
  });
}

/** One catalogue row per published procedure. The workflow itself is not
 *  seeded: at 243 procedures it is 3.4 MB, and the registry serves it from
 *  public/data/procedures/<id>.json when a case needs it. */
export function procedureSeeds() {
  return Object.values(CATALOGUE).map((procedure) => ({
    id: `procedure:${procedure.id}:v1`,
    procedureId: procedure.id,
    version: 1,
    status: "published" as const,
    title: procedure.title,
    definition: procedure,
  }));
}
