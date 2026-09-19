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
  type: "government" | "bank" | "transport" | "inspection" | "certification" | "facility";
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

function entityType(name: string): SeedEntity["type"] {
  if (/bank/i.test(name)) return "bank";
  if (/quarantine|sanitary|inspection|border checkpoint/i.test(name)) return "inspection";
  if (/expertiza|certificat/i.test(name)) return "certification";
  if (/railway|cargo|freight|station|airport|transport/i.test(name)) return "transport";
  if (/warehouse|place of loading|location of goods/i.test(name)) return "facility";
  return "government";
}

export function mockEntities(): SeedEntity[] {
  // The catalogue already lists every entity each procedure names, so seeding
  // the directory needs no workflow files.
  const names = [...new Set(Object.values(CATALOGUE).flatMap((procedure) => procedure.entities.map((entity) => entity.trim())))]
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
