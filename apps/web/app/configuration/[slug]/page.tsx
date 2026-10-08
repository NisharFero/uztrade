import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "../../../components/icons";
import { REGISTRIES, registryFor } from "../master-data";
import RegistryTable from "./registry-table";

/* One registry's records. Read-only, and deliberately so: this is the master
 * data a deployment has to supply, shown so it can be reviewed and argued
 * with before anybody builds a table for it. Nothing here writes. */

export function generateStaticParams() {
  return REGISTRIES.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const registry = registryFor(slug);
  return { title: `${registry?.name ?? "Registry"} · Configuration · UzOne Trade Platform` };
}

export default async function RegistryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const registry = registryFor(slug);
  if (!registry) notFound();

  return (
    <>
      <header className="page-head">
        <p>
          <Link href="/dashboard" className="crumb">
            Dashboard
          </Link>{" "}
          ·{" "}
          <Link href="/configuration" className="crumb">
            Configuration
          </Link>{" "}
          · {registry.name}
        </p>
        <h1>{registry.name}</h1>
        <p className="page-lede">{registry.blurb}</p>
      </header>

      {/* The bar, the add control and the table are one client unit: the rows
          this browser has added have to appear in all three. */}
      <RegistryTable slug={registry.slug} columns={registry.columns} rows={registry.rows} authored={registry.authored} />

      {registry.source ? <p className="cfg-bar-note cfg-source">{registry.source}</p> : null}

      {registry.authored ? (
        <p className="cfg-note">
          <span className="head-icon">{Icon.sparkle}</span>
          Maintained by hand, effective-dated, and version-pinned onto a case — so a shipment is judged by the rules
          that applied when it was opened.
        </p>
      ) : null}

      <nav className="cfg-next" aria-label="Other registries">
        <span className="wf-detail-h">Other registries</span>
        <ul>
          {REGISTRIES.filter((r) => r.slug !== registry.slug).map((r) => (
            <li key={r.slug}>
              <Link href={`/configuration/${r.slug}`}>
                <strong>{r.name}</strong>
                <em>{r.rows.length} records</em>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
