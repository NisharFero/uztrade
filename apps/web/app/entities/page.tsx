import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "../../components/icons";
import { listEntityQueues } from "../../modules/catalog/catalog";
import { entityName, type EntityType } from "../../modules/catalog/seed";
import { CATALOGUE, PROCEDURE_IDS } from "../../modules/procedures/data/procedures.generated";
import { getProcedures } from "../../modules/procedures/registry";
import EntityAction from "../../components/entities/entity-action";

export const metadata: Metadata = { title: "Entities · UzOne Trade Platform" };
export const dynamic = "force-dynamic";

/* The directory, by kind.
 *
 * Forty-two counterparties in one list was a wall of names with no way in, so
 * the kinds come first and the names follow the one you pick. The kind is in
 * the URL, which makes a view shareable and the back button work.
 *
 * What each entity *is* is derived, never authored: how many of the published
 * procedures name it, and the step they most often name it for. The blurbs
 * below describe the nine kinds — the classification `ENTITY_RULES` already
 * makes in modules/catalog/seed.ts — and nothing else. */

/** Families group the nine kinds into the five things a trader actually deals
 *  with, and each family keeps one hue. Colour is never the only signal: the
 *  family is written out beside it. */
const FAMILY = {
  state: { label: "State bodies", hue: "blue" },
  digital: { label: "Online systems", hue: "cyan" },
  money: { label: "Money", hue: "amber" },
  movement: { label: "Movement & storage", hue: "green" },
  private: { label: "Private providers", hue: "fuchsia" },
} as const;

type Family = keyof typeof FAMILY;

const TYPES: { id: EntityType; label: string; family: Family; icon: React.ReactNode; blurb: string }[] = [
  { id: "government", label: "Government", family: "state", icon: Icon.landmark, blurb: "Ministries and state committees that decide on a case rather than process it." },
  { id: "customs", label: "Customs", family: "state", icon: Icon.lock, blurb: "Customs posts and border crossings where a consignment is declared, checked and released." },
  { id: "inspection", label: "Inspection", family: "state", icon: Icon.compliance, blurb: "Quarantine, sanitary and checkpoint bodies that examine the goods themselves before they may travel." },
  { id: "certification", label: "Certification", family: "state", icon: Icon.documents, blurb: "Bodies that test, assess and issue the certificate a shipment has to travel on." },
  { id: "portal", label: "Portals", family: "digital", icon: Icon.compose, blurb: "The online systems a filing is actually submitted through — the ones an agent can reach without you." },
  { id: "bank", label: "Banks", family: "money", icon: Icon.receipt, blurb: "Where a duty, tariff or service fee is settled. Money only ever moves on your authorisation." },
  { id: "transport", label: "Transport", family: "movement", icon: Icon.truck, blurb: "Carriers, railways, stations and terminals that move the cargo or hold it between legs." },
  { id: "facility", label: "Facilities", family: "movement", icon: Icon.home, blurb: "Warehouses and loading places: where the goods physically are when a step asks for them." },
  { id: "service", label: "Services", family: "private", icon: Icon.user, blurb: "Private intermediaries — brokers, forwarders, insurers and sales agents you appoint yourself." },
];

const CAPABILITY: Record<string, string> = {
  perform_inspection: "Carries out inspections",
  accept_payment: "Accepts payment",
  complete_procedure_step: "Completes procedure steps",
};

export default async function EntitiesPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type: asked } = await searchParams;
  const selected = TYPES.find((t) => t.id === asked)?.id ?? null;

  let entities: Awaited<ReturnType<typeof listEntityQueues>> = [];
  let error: string | null = null;
  try {
    entities = await listEntityQueues();
  } catch (reason) {
    error = reason instanceof Error ? reason.message : "Could not load entities";
  }

  /* How many published procedures name each entity — the honest measure of how
     much of the corpus runs through it. Read from the catalogue summary, which
     already lists every procedure's entities. */
  const procedureCount = new Map<string, number>();
  for (const id of PROCEDURE_IDS)
    for (const name of new Set(CATALOGUE[id].entities.map(entityName)))
      procedureCount.set(name, (procedureCount.get(name) ?? 0) + 1);

  /* The step an entity is most often named for, so the card can say what it is
     for rather than only how big it is. */
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
    for (const [name, seen] of counts)
      typical.set(name, [...seen].sort((a, b) => b[1] - a[1])[0][0]);
  } catch {
    // The corpus is a nicety here; the directory still reads without it.
  }

  const open = (t: EntityType) =>
    entities.filter((e) => e.type === t).reduce((n, e) => n + e.openTasks.length, 0);
  const rows = selected ? entities.filter((e) => e.type === selected) : [];
  const chosen = TYPES.find((t) => t.id === selected) ?? null;
  const openTotal = entities.reduce((n, e) => n + e.openTasks.length, 0);

  return (
    <>
      <header className="page-head">
        <p data-tint="green">
          <span className="head-icon">{Icon.landmark}</span> Workflow counterparties
        </p>
        <h1>External entities</h1>
        <p className="page-lede">
          {entities.length || 42} organizations and facilities the agents file with, in {TYPES.length} kinds.{" "}
          {openTotal ? `${openTotal} physical action${openTotal === 1 ? "" : "s"} ready.` : "Nothing waiting on a counter right now."}
        </p>
      </header>

      {error ? (
        <p className="query-note" data-tone="error">
          <span className="head-icon">{Icon.clock}</span>
          {error}
        </p>
      ) : null}

      {/* Kinds first. Each card explains itself on hover or keyboard focus, and
          the one you are looking at keeps its explanation open — so the detail
          is never only available to a mouse. */}
      <ul className="ent-types" aria-label="Kinds of entity">
        {TYPES.map((t) => {
          const count = entities.filter((e) => e.type === t.id).length;
          const waiting = open(t.id);
          const isOn = selected === t.id;
          return (
            <li key={t.id}>
              <Link
                className="ent-type"
                href={isOn ? "/entities" : `/entities?type=${t.id}`}
                data-hue={FAMILY[t.family].hue}
                data-on={isOn ? "true" : "false"}
                aria-current={isOn ? "true" : undefined}
              >
                <span className="ent-type-icon">{t.icon}</span>
                <span className="ent-type-name">{t.label}</span>
                <span className="ent-type-family">{FAMILY[t.family].label}</span>
                <span className="ent-type-counts">
                  <strong>{count}</strong> {count === 1 ? "entity" : "entities"}
                  {waiting ? <em>{waiting} ready</em> : null}
                </span>
                <span className="ent-type-blurb">
                  <span>{t.blurb}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {chosen ? (
        <section className="ent-panel" aria-label={`${chosen.label} entities`}>
          <div className="section-head">
            <p data-tint={FAMILY[chosen.family].hue}>
              <span className="head-icon">{chosen.icon}</span>
              {FAMILY[chosen.family].label}
            </p>
            <h2>
              {chosen.label} · {rows.length} {rows.length === 1 ? "entity" : "entities"}
            </h2>
            <p className="wf-shipment-line">{chosen.blurb}</p>
          </div>

          {rows.length ? (
            <ul className="ent-list">
              {rows.map((entity) => {
                const named = procedureCount.get(entity.canonicalName) ?? 0;
                const does = typical.get(entity.canonicalName);
                return (
                  /* The row carries the essentials; the panel adds the
                     explanation on hover or focus. Anchored inside the column,
                     so it has no viewport edge to run off. */
                  <li className="ent-row" key={entity.id} tabIndex={0}>
                    <span className="ent-row-icon" data-hue={FAMILY[chosen.family].hue}>
                      {chosen.icon}
                    </span>
                    <span className="ent-row-main">
                      <strong>{entity.canonicalName}</strong>
                      <small>
                        {named ? `${named} of ${PROCEDURE_IDS.length} procedures` : "Not named in the corpus"}
                        {entity.openTasks.length ? ` · ${entity.openTasks.length} ready` : ""}
                        {entity.completedTasks ? ` · ${entity.completedTasks} completed` : ""}
                      </small>
                    </span>
                    <span className="ent-row-state" data-sim={entity.simulationMode ? "true" : "false"}>
                      {entity.simulationMode ? "Mock" : "Connected"}
                    </span>

                    <div className="ent-pop" role="note">
                      <strong>{entity.canonicalName}</strong>
                      <p className="ent-pop-kind">
                        {chosen.label} · {FAMILY[chosen.family].label}
                      </p>
                      {does ? (
                        <p className="ent-pop-does">
                          <em>Most often for</em> {does}
                        </p>
                      ) : null}
                      <dl className="ent-pop-facts">
                        <div>
                          <dt>Named in</dt>
                          <dd>
                            {named} of {PROCEDURE_IDS.length} procedures
                          </dd>
                        </div>
                        <div>
                          <dt>Ready now</dt>
                          <dd>{entity.openTasks.length}</dd>
                        </div>
                        <div>
                          <dt>Completed</dt>
                          <dd>{entity.completedTasks}</dd>
                        </div>
                        <div>
                          <dt>Connection</dt>
                          <dd>{entity.simulationMode ? "Simulated for the demo" : "Live"}</dd>
                        </div>
                      </dl>
                      {entity.capabilities?.length ? (
                        <p className="ent-pop-caps">
                          {entity.capabilities.map((c: string) => CAPABILITY[c] ?? c).join(" · ")}
                        </p>
                      ) : null}
                    </div>

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
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="ent-empty">No entity of this kind is in the directory yet.</p>
          )}

          <p className="ent-back">
            <Link className="crumb" href="/entities">
              ← All kinds
            </Link>
          </p>
        </section>
      ) : (
        <p className="ent-hint">
          <span className="head-icon">{Icon.sparkle}</span>
          Pick a kind to see the entities in it. Hover or tab to a card for what the kind covers.
        </p>
      )}
    </>
  );
}
