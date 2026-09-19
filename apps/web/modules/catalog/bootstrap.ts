import { getDb } from "../../db";
import { ensureSchema } from "../../db/migrate";
import { entities, procedureVersions, users } from "../../db/schema";
import { mockEntities, mockUsers, procedureSeeds } from "./seed";

let bootstrapped: Promise<void> | null = null;

async function seed() {
  await ensureSchema();
  const db = getDb();
  for (const user of mockUsers()) {
    await db.insert(users).values({ ...user, capabilities: JSON.stringify(user.capabilities) }).onConflictDoNothing();
  }
  for (const entity of mockEntities()) {
    await db.insert(entities).values({ ...entity, capabilities: JSON.stringify(entity.capabilities), contact: JSON.stringify(entity.contact) }).onConflictDoNothing();
  }
  const procedures = procedureSeeds();
  for (let i = 0; i < procedures.length; i += 50) {
    await db.insert(procedureVersions).values(
      procedures.slice(i, i + 50).map((procedure) => ({ ...procedure, definition: JSON.stringify(procedure.definition) })),
    ).onConflictDoNothing();
  }
}

export function ensureBackendCatalog() {
  bootstrapped ??= seed().catch((error) => {
    bootstrapped = null;
    throw error;
  });
  return bootstrapped;
}
