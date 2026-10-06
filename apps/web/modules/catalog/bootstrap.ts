import { sql } from "drizzle-orm";
import { getDb } from "../../db";
import { ensureSchema } from "../../db/migrate";
import { entities, procedureVersions, users } from "../../db/schema";
import { mockEntities, mockUsers, procedureSeeds } from "./seed";

let bootstrapped: Promise<void> | null = null;

/* The seed owns the master data it writes, so a second run brings the table
 * back in line with it: an entity's name and type, and a published v1's title,
 * definition and status. What a user can change (contact details, simulation
 * mode, status of an entity; any version after v1) is left alone. Before this,
 * rows were only ever inserted, so a corrected type or a changed procedure
 * never reached a database that already had the row. */
export async function syncMasterData() {
  await ensureSchema();
  const db = getDb();
  const [existingUsers, existingEntities, existingProcedures] = await Promise.all([
    db.select({ id: users.id }).from(users),
    db.select({ id: entities.id, canonicalName: entities.canonicalName, type: entities.type }).from(entities),
    db.select({ id: procedureVersions.id, title: procedureVersions.title, definition: procedureVersions.definition, status: procedureVersions.status }).from(procedureVersions),
  ]);
  const userIds = new Set(existingUsers.map((row) => row.id));
  const entitiesById = new Map(existingEntities.map((row) => [row.id, row]));
  const proceduresById = new Map(existingProcedures.map((row) => [row.id, row]));
  for (const user of mockUsers().filter((row) => !userIds.has(row.id))) {
    await db.insert(users).values({ ...user, capabilities: JSON.stringify(user.capabilities) }).onConflictDoNothing();
  }
  for (const entity of mockEntities().filter((row) => {
    const stored = entitiesById.get(row.id);
    return !stored || stored.canonicalName !== row.canonicalName || stored.type !== row.type;
  })) {
    await db
      .insert(entities)
      .values({ ...entity, capabilities: JSON.stringify(entity.capabilities), contact: JSON.stringify(entity.contact) })
      .onConflictDoUpdate({ target: entities.id, set: { canonicalName: sql`excluded.canonical_name`, type: sql`excluded.type` } });
  }
  const procedures = procedureSeeds().filter((row) => {
    const stored = proceduresById.get(row.id);
    return !stored || stored.title !== row.title || stored.status !== row.status || stored.definition !== JSON.stringify(row.definition);
  });
  for (let i = 0; i < procedures.length; i += 50) {
    await db
      .insert(procedureVersions)
      .values(procedures.slice(i, i + 50).map((procedure) => ({ ...procedure, definition: JSON.stringify(procedure.definition) })))
      .onConflictDoUpdate({
        target: procedureVersions.id,
        set: { title: sql`excluded.title`, definition: sql`excluded.definition`, status: sql`excluded.status` },
      });
  }
}

export function ensureBackendCatalog() {
  bootstrapped ??= syncMasterData().catch((error) => {
    bootstrapped = null;
    throw error;
  });
  return bootstrapped;
}
