import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "../../../components/icons";
import { listEntityQueues } from "../../../modules/catalog/catalog";
import { entityName } from "../../../modules/catalog/seed";
import { CATALOGUE, PROCEDURE_IDS } from "../../../modules/procedures/data/procedures.generated";
import { getProcedures } from "../../../modules/procedures/registry";
import EntityAction from "../../../components/entities/entity-action";
import { CAPABILITY, FAMILY, TYPES } from "../kinds";

/* One kind of counterparty, on its own page.
 *
 * What the kind IS comes from the classification in modules/catalog/seed.ts,
 * written out here once. What each entity is comes from the corpus: how many
 * published procedures name it, and the step it is named for most. Nothing
 * about an entity is authored — there are no stored descriptions, and
 * inventing forty-two of them would be writing fiction into a directory. */

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return TYPES.map((t) => ({ type: t.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const kind = TYPES.find((t) => t.id === type);
  return { title: `${kind?.label ?? "Entities"} · Entities · UzOne Trade Platform` };
}

export default async function EntityKindPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const kind = TYPES.find((t) => t.id === type);
  if (!kind) notFound();

  let all: Awaited<ReturnType<typeof listEntityQueues>> = [];
  let error: string | null = null;
  try {
    all = await listEntityQueues();
  } catch (reason) {
    error = reason instanceof Error ? reason.message : "Could not load entities";
  }
  const rows = all.filter((e) => e.type === kind.id);

  /* How much of the corpus runs through each one, from the catalogue summary
     that already lists every procedure's entities. */
  const procedureCount = new Map<string, number>();
  for (const id of PROCEDURE_IDS)
    for (const name of new Set(CATALOGUE[id].entities.map(entityName)))
      procedureCount.set(name, (procedureCount.get(name) ?? 0) + 1);

  /* The step each is most often named for, so a card can say what it is FOR
     and not only how big it is. */
  const typical = new Map<string, string>();
  try {
    const counts = new Map<string, Map<string, number>>();
    for (const procedure of await getProcedures([...PROCEDURE_IDS]))
      for (const block of procedure.blocks)
        for (const step of block.steps) {
          const name = entityName(step.entity);
          if (!name) continue;
          const seen = counts.get(name) ?? new Map<string, number>();
          seen.set(step.title, (seen.get(step.title) ?? 0) + 1);
          counts.set(name, seen);
        }
    for (const [name, seen] of counts) typical.set(name, [...seen].sort((a, b) => b[1] - a[1])[0][0]);
  } catch {
    // The corpus is a nicety here; the directory still reads without it.
  }

  const waiting = rows.reduce((n, e) => n + e.openTasks.length, 0);
  const hue = FAMILY[kind.family].hue;

  /* Sorted by reach, because that is the one number that separates these
     rows from each other — a portal named in 112 procedures is not the same
     kind of thing as one named in 1, and alphabetical order hides that. */
  const listed = rows
    .map((e) => ({ entity: e, named: procedureCount.get(e.canonicalName) ?? 0, does: typical.get(e.canonicalName) }))
    .sort((a, b) => b.named - a.named || a.entity.canonicalName.localeCompare(b.entity.canonicalName));

  /* Anything true of EVERY entity here is said once, above the list, rather
     than repeated down forty rows of identical text. */
  const shared = rows.length
    ? (rows[0].capabilities ?? []).filter((c: string) => rows.every((e) => e.capabilities?.includes(c)))
    : [];
  const allSimulated = rows.length > 0 && rows.every((e) => e.simulationMode);

  return (
    <>
      <header className="page-head">
        <p data-tint={hue}>
          <Link href="/" className="crumb">
            Dashboard
          </Link>{" "}
          ·{" "}
          <Link href="/entities" className="crumb">
            Entities
          </Link>{" "}
          · {kind.label}
        </p>
        <h1>{kind.label}</h1>
        <p className="page-lede">{kind.blurb}</p>
      </header>

      <div className="cfg-bar">
        <span className="ent-kind-badge" data-hue={hue}>
          <span aria-hidden="true">{kind.icon}</span>
          {FAMILY[kind.family].label}
        </span>
        <span className="cfg-pill">
          {rows.length} {rows.length === 1 ? "entity" : "entities"}
        </span>
        {waiting ? <span className="cfg-pill" data-tone="accent">{waiting} ready now</span> : null}
        {allSimulated ? <span className="cfg-pill">Simulated for the demo</span> : null}
        {shared.map((c: string) => (
          <span className="cfg-pill" key={c}>
            {CAPABILITY[c] ?? c}
          </span>
        ))}
      </div>

      {error ? (
        <p className="query-note" data-tone="error">
          <span className="head-icon">{Icon.clock}</span>
          {error}
        </p>
      ) : null}

      {rows.length ? (
        <>
          <p className="ent-reach-key">
            Ordered by reach — how many of the {PROCEDURE_IDS.length} published procedures name each one.
          </p>
          <ul className="ent-list" aria-label={`${kind.label} entities`}>
          {listed.map(({ entity, named, does }) => {
            /* Against the whole corpus, not against the busiest row here, so
               the bar means the same thing on every kind's page. */
            const reach = Math.round((named / PROCEDURE_IDS.length) * 100);
            const own = (entity.capabilities ?? []).filter((c: string) => !shared.includes(c));
            return (
              <li className="ent-card" key={entity.id}>
                <span className="ent-row-icon" data-hue={hue}>
                  {kind.icon}
                </span>
                <div className="ent-card-body">
                  <strong>{entity.canonicalName}</strong>
                  {does ? (
                    <p className="ent-card-does">
                      <em>Most often for</em> {does}
                    </p>
                  ) : null}
                  {own.length || entity.completedTasks || (!allSimulated && entity.simulationMode) ? (
                    <p className="ent-pop-caps">
                      {[
                        ...own.map((c: string) => CAPABILITY[c] ?? c),
                        entity.completedTasks ? `${entity.completedTasks} completed` : null,
                        !allSimulated && entity.simulationMode ? "Simulated for the demo" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}

                  {entity.openTasks.length ? (
                    <ul className="ent-tasks">
                      {entity.openTasks.map((task) => (
                        <li key={task.id}>
                          <div>
                            <Link href={`/cases/${task.caseId}`}>{task.caseId}</Link>
                            <strong>{task.title}</strong>
                            <small>
                              {task.blockName} · step {task.stepNum}
                            </small>
                          </div>
                          <EntityAction workItemId={task.id} entityId={entity.id} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="ent-reach" data-hue={hue}>
                  <span className="ent-reach-n">
                    <strong>{named}</strong> of {PROCEDURE_IDS.length}
                  </span>
                  <span className="ent-reach-bar" aria-hidden="true">
                    <span style={{ width: `${Math.max(named ? 2 : 0, reach)}%` }} />
                  </span>
                </div>
              </li>
            );
          })}
          </ul>
        </>
      ) : (
        <p className="ent-empty">No entity of this kind is in the directory yet.</p>
      )}

      <nav className="cfg-next" aria-label="Other kinds">
        <span className="wf-detail-h">Other kinds</span>
        <ul>
          {TYPES.filter((t) => t.id !== kind.id).map((t) => (
            <li key={t.id}>
              <Link href={`/entities/${t.id}`}>
                <strong>{t.label}</strong>
                <em>{all.filter((e) => e.type === t.id).length} entities</em>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
