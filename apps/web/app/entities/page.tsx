import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "../../components/icons";
import { listEntityQueues } from "../../modules/catalog/catalog";
import { FAMILY, TYPES } from "./kinds";

export const metadata: Metadata = { title: "Entities · UzOne Trade Platform" };
export const dynamic = "force-dynamic";

/* The directory: the kinds, and nothing else.
 *
 * Each kind opens its own page rather than unfolding here. Forty-two
 * counterparties behind nine cards is a lot to reveal in place — and a kind
 * worth reading about deserves a URL that can be sent to someone. */
export default async function EntitiesPage() {
  let entities: Awaited<ReturnType<typeof listEntityQueues>> = [];
  let error: string | null = null;
  try {
    entities = await listEntityQueues();
  } catch (reason) {
    error = reason instanceof Error ? reason.message : "Could not load entities";
  }

  const openTotal = entities.reduce((n, e) => n + e.openTasks.length, 0);

  return (
    <>
      <header className="page-head">
        <p data-tint="green">
          <span className="head-icon">{Icon.landmark}</span> Workflow counterparties
        </p>
        <h1>External entities</h1>
        <p className="page-lede">
          {entities.length || 42} organizations and facilities the agents file with, in {TYPES.length} kinds. Open a
          kind to read what it covers and who is in it.{" "}
          {openTotal ? `${openTotal} physical action${openTotal === 1 ? "" : "s"} ready now.` : "Nothing waiting on a counter right now."}
        </p>
      </header>

      {error ? (
        <p className="query-note" data-tone="error">
          <span className="head-icon">{Icon.clock}</span>
          {error}
        </p>
      ) : null}

      <ul className="ent-types" aria-label="Kinds of entity">
        {TYPES.map((t) => {
          const count = entities.filter((e) => e.type === t.id).length;
          const waiting = entities.filter((e) => e.type === t.id).reduce((n, e) => n + e.openTasks.length, 0);
          return (
            <li key={t.id}>
              <Link className="ent-type" href={`/entities/${t.id}`} data-hue={FAMILY[t.family].hue}>
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
                <span className="ent-type-go">
                  Open <span aria-hidden="true">→</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
