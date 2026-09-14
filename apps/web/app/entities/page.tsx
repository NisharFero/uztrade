import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "../icons";
import { listEntityQueues } from "../lib/backend-catalog";
import EntityAction from "./entity-action";

export const metadata: Metadata = { title: "Entities · UzTrade" };
export const dynamic = "force-dynamic";

export default async function EntitiesPage() {
  let entities: Awaited<ReturnType<typeof listEntityQueues>> = [];
  let error: string | null = null;
  try {
    entities = await listEntityQueues();
  } catch (reason) {
    error = reason instanceof Error ? reason.message : "Could not load entities";
  }
  const openCount = entities.reduce((total, entity) => total + entity.openTasks.length, 0);

  return (
    <>
      <header className="page-head">
        <p><span className="head-icon">{Icon.physical}</span> Workflow counterparties</p>
        <h1>External entities</h1>
        <p className="page-lede">{entities.length || 25} organizations and facilities · {openCount} physical action{openCount === 1 ? "" : "s"} ready</p>
      </header>

      {error ? <p className="query-note" data-tone="error">{error}</p> : null}

      <section className="entity-table" aria-label="External entities">
        <div className="entity-row entity-head" aria-hidden="true">
          <span>Entity</span><span>Type</span><span>Workflow activity</span>
        </div>
        {entities.map((entity) => (
          <article className="entity-row" key={entity.id} data-active={entity.openTasks.length ? "true" : "false"}>
            <div className="entity-name">
              <span className="agent-icon">{Icon.physical}</span>
              <div><strong>{entity.canonicalName}</strong><small>{entity.simulationMode ? "Mock connection" : "Connected"}</small></div>
            </div>
            <span className="entity-type">{entity.type}</span>
            <div className="entity-work">
              {entity.openTasks.length ? entity.openTasks.map((task) => (
                <div className="entity-task" key={task.id}>
                  <div>
                    <Link href={`/cases/${task.caseId}`}>{task.caseId}</Link>
                    <strong>{task.title}</strong>
                    <small>{task.blockName} · step {task.stepNum}</small>
                  </div>
                  <EntityAction workItemId={task.id} entityId={entity.id} />
                </div>
              )) : <span className="entity-idle">No physical steps ready{entity.completedTasks ? ` · ${entity.completedTasks} completed` : ""}</span>}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
