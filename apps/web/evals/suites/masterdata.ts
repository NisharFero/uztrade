/* Is the master data in Postgres what the application thinks it is?
 *
 * The chat's case tools read cases, workflow runs and nodes from Postgres, and
 * the entity directory and procedure versions live there too. The published
 * procedures themselves are bundled (the catalogue and public/data/procedures),
 * and the seed copies them into procedure_versions. So "clean" means three
 * things, each checked here:
 *
 *   master data   every procedure is published exactly once, with the
 *                 catalogue's title and definition; every entity a procedure
 *                 names is in the directory once, with its hand-checked type
 *                 (evals/gold/entities.json); nothing else is in there
 *   references    every case points at a published procedure, a run that is
 *                 its own, and a version of the same procedure; every node's
 *                 entity is in the directory; nothing is orphaned
 *   payloads      the JSON columns parse
 *
 * Skipped without DATABASE_URL. Read-only: it never writes.
 */
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { getDb } from "../../db";
import { entityName, mockEntities, procedureSeeds } from "../../modules/catalog/seed";
import { CATALOGUE, PROCEDURE_IDS } from "../../modules/procedures/data/procedures.generated";
import type { CaseResult, Suite } from "../types";

type Row = Record<string, unknown>;

const rowsOf = async (query: ReturnType<typeof sql>): Promise<Row[]> => {
  const result = (await getDb().execute(query)) as unknown as Row[] | { rows: Row[] };
  return Array.isArray(result) ? result : result.rows;
};

const parses = (text: unknown) => {
  try {
    JSON.parse(String(text));
    return true;
  } catch {
    return false;
  }
};

/** The facets of a procedure a stale copy would get wrong. */
const facets = (p: Record<string, unknown>) =>
  JSON.stringify([p.id, p.title, p.direction, p.goods, p.mode, p.kind, p.regime, p.timeframe, p.stepsCount, p.blocksCount, p.onlineCount]);

const sample = (items: string[], n = 4) => `${items.slice(0, n).join(", ")}${items.length > n ? ` and ${items.length - n} more` : ""}`;

export const masterDataSuite: Suite = {
  name: "masterdata",
  about: "Postgres against the published catalogue: procedures published once and current, entities present once with the right type, every case and run pointing at real rows, nothing orphaned.",
  needsDatabase: true,
  async run(): Promise<CaseResult[]> {
    const results: CaseResult[] = [];
    const add = (id: string, problems: string[], okDetail?: string) =>
      results.push({ id, ok: problems.length === 0, detail: problems.length ? sample(problems) : okDetail });

    /* ---------------------------------------------------- procedures --- */
    const versions = await rowsOf(sql`select id, procedure_id, version, status, title, definition from procedure_versions`);
    const published = versions.filter((v) => v.status === "published");
    const byProcedure = new Map<string, Row[]>();
    for (const v of published) byProcedure.set(String(v.procedure_id), [...(byProcedure.get(String(v.procedure_id)) ?? []), v]);

    add(
      "procedures: every published procedure has a published version",
      PROCEDURE_IDS.filter((id) => !byProcedure.has(id)).map((id) => `${id} missing`),
      `${PROCEDURE_IDS.length} of ${PROCEDURE_IDS.length}`,
    );
    add(
      "procedures: exactly one published version each",
      [...byProcedure].filter(([, list]) => list.length > 1).map(([id, list]) => `${id} has ${list.length}`),
    );
    add(
      "procedures: nothing published outside the catalogue",
      [...byProcedure.keys()].filter((id) => !CATALOGUE[id]).map((id) => `${id} is not in the catalogue`),
    );
    const seeded = new Map(procedureSeeds().map((s) => [s.id, s]));
    const stale: string[] = [];
    for (const v of published) {
      const seed = seeded.get(String(v.id));
      if (!seed) continue; // a version a user published, not the seed's
      if (!parses(v.definition)) {
        stale.push(`${v.procedure_id} definition is not JSON`);
        continue;
      }
      if (v.title !== seed.title) stale.push(`${v.procedure_id} title "${v.title}" ≠ "${seed.title}"`);
      else if (facets(JSON.parse(String(v.definition))) !== facets(seed.definition as unknown as Record<string, unknown>)) {
        stale.push(`${v.procedure_id} definition differs from the catalogue`);
      }
    }
    add("procedures: stored definitions match the catalogue", stale);

    /* ------------------------------------------------------ entities --- */
    const gold = (JSON.parse(readFileSync("evals/gold/entities.json", "utf8")) as { entities: Record<string, string> }).entities;
    const seedEntities = mockEntities();
    const stored = await rowsOf(sql`select id, canonical_name, type, status from entities`);
    const storedById = new Map(stored.map((e) => [String(e.id), e]));

    add(
      "entities: every entity a procedure names is in the directory",
      seedEntities.filter((e) => !storedById.has(e.id)).map((e) => `${e.canonicalName} missing`),
      `${seedEntities.length} entities`,
    );
    const seedIds = new Set(seedEntities.map((e) => e.id));
    add(
      "entities: no seeded entity left over that no procedure names",
      stored.filter((e) => String(e.id).startsWith("ent-") && !seedIds.has(String(e.id))).map((e) => String(e.canonical_name)),
    );
    const names = stored.map((e) => entityName(String(e.canonical_name)).toLowerCase());
    add(
      "entities: each name appears once",
      names.filter((n, i) => names.indexOf(n) !== i),
    );
    add(
      "entities: every entity has a hand-checked type in the gold",
      seedEntities.filter((e) => !gold[e.canonicalName]).map((e) => `${e.canonicalName} has no gold type`),
    );
    add(
      "entities: types in Postgres match the gold",
      stored
        .filter((e) => gold[entityName(String(e.canonical_name))] && gold[entityName(String(e.canonical_name))] !== e.type)
        .map((e) => `${e.canonical_name}: ${e.type}, should be ${gold[entityName(String(e.canonical_name))]}`),
    );

    /* ---------------------------------------------------- references --- */
    const cases = await rowsOf(sql`select c.id, c.procedure_id, c.workflow_run_id, c.shipment_facts, c.document_state,
                                     r.id as run_id, r.case_id as run_case, v.procedure_id as version_procedure
                                   from cases c
                                   left join workflow_runs r on r.id = c.workflow_run_id
                                   left join procedure_versions v on v.id = r.procedure_version_id`);
    add(
      "cases: each follows a published procedure",
      cases.filter((c) => !CATALOGUE[String(c.procedure_id)]).map((c) => `${c.id} → ${c.procedure_id}`),
      `${cases.length} cases`,
    );
    add(
      "cases: each run exists and belongs to its case",
      cases
        .filter((c) => c.workflow_run_id && (!c.run_id || c.run_case !== c.id))
        .map((c) => `${c.id} → run ${c.workflow_run_id}`),
    );
    add(
      "cases: each run follows a version of the case's own procedure",
      cases.filter((c) => c.run_id && c.version_procedure !== c.procedure_id).map((c) => `${c.id}: ${c.procedure_id} vs ${c.version_procedure ?? "no version"}`),
    );
    add(
      "cases: shipment facts and document state are JSON",
      cases.flatMap((c) => [
        ...(parses(c.shipment_facts) ? [] : [`${c.id} shipment_facts`]),
        ...(parses(c.document_state) ? [] : [`${c.id} document_state`]),
      ]),
    );

    const nodeEntities = await rowsOf(sql`select distinct entity_name from workflow_nodes where entity_name <> ''`);
    const known = new Set(stored.map((e) => entityName(String(e.canonical_name)).toLowerCase()));
    add(
      "workflow: every node's entity is in the directory",
      nodeEntities.map((n) => String(n.entity_name)).filter((n) => !known.has(entityName(n).toLowerCase())),
    );

    const orphans: [string, ReturnType<typeof sql>][] = [
      ["runs without a case", sql`select count(*)::int as n from workflow_runs r left join cases c on c.id = r.case_id where c.id is null`],
      ["nodes without a run", sql`select count(*)::int as n from workflow_nodes n left join workflow_runs r on r.id = n.run_id where r.id is null`],
      ["edges to missing nodes", sql`select count(*)::int as n from workflow_edges e left join workflow_nodes a on a.id = e.from_node_id left join workflow_nodes b on b.id = e.to_node_id where a.id is null or b.id is null`],
      ["work items without a node", sql`select count(*)::int as n from work_items w left join workflow_nodes n on n.id = w.node_id where n.id is null`],
      ["case blocks without a case", sql`select count(*)::int as n from case_blocks b left join cases c on c.id = b.case_id where c.id is null`],
      ["runs without a procedure version", sql`select count(*)::int as n from workflow_runs r left join procedure_versions v on v.id = r.procedure_version_id where v.id is null`],
    ];
    const orphaned: string[] = [];
    for (const [label, query] of orphans) {
      const [row] = await rowsOf(query);
      if (Number(row?.n) > 0) orphaned.push(`${row.n} ${label}`);
    }
    add("references: nothing orphaned", orphaned);

    return results;
  },
};
