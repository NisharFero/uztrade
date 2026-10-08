import Link from "next/link";
import { Icon } from "../../components/icons";
import { REGISTRIES } from "./master-data";

/* The configuration reference: the master data the platform stands on.
 *
 * Deliberately UI-only. Every number here is a statement about the master data
 * a deployment has to supply, not a reading of it - nothing on this page is
 * fetched, and no registry is backed by a table. When a registry becomes real
 * it moves out of this file and the page reads it like any other; until then
 * this is the specification, kept where it can be seen rather than in a doc. */

export const metadata = { title: "Configuration · UzOne Trade Platform" };

const REGISTRY_ICON: Record<string, React.ReactNode> = {
  countries: Icon.globe,
  currencies: Icon.receipt,
  "commodity-codes": Icon.book,
  units: Icon.weight,
  "transport-modes": Icon.truck,
  locations: Icon.landmark,
};

export default function ConfigurationPage() {
  const authored = REGISTRIES.filter((r) => r.authored).length;


  return (
    <>
      <header className="page-head">
        <p data-tint="blue">
          <Link href="/dashboard" className="crumb">
            Dashboard
          </Link>{" "}
          · Configuration
        </p>
        <h1>Configuration master data</h1>
        <p className="page-lede">
          Review the countries, classifications, units, and locations used to describe trade operations.
          Open a registry to inspect its fields and search its records.
        </p>
      </header>


      <section className="cfg-section" aria-labelledby="cfg-registries">
        <p className="cfg-eyebrow" data-tint="blue">
          <span className="head-icon">{Icon.list}</span>
          Open any registry
        </p>
        <h2 id="cfg-registries">Reference registries</h2>
        <p className="cfg-note">
          <span className="head-icon">{Icon.sparkle}</span>
          {authored} registries are maintained manually; {REGISTRIES.length - authored} are derived from published procedures.
          These are reference datasets. Entries added on a registry page are saved in this browser and do not update the live intake data.
        </p>
        <ul className="ent-types cfg-registry-grid" aria-label="Reference registries">
          {REGISTRIES.map((registry) => {
            /* A sample worth reading: the column a human would recognise,
               not the key column, so commodity codes show "Cattle, purebred
               breeding animals" rather than "0102 21". */
            const readable =
              registry.columns.find((c) => /name|description|country|unit|mode|location/i.test(c.key)) ?? registry.columns[0];
            const sample = registry.rows
              .slice(0, 3)
              .map((row) => String(row[readable.key]))
              .filter(Boolean);
            return (
              <li key={registry.slug}>
                <Link
                  className="ent-type cfg-registry-card"
                  data-hue={registry.authored ? "blue" : "green"}
                  href={`/configuration/${registry.slug}`}
                >
                  <span className="ent-type-icon">{REGISTRY_ICON[registry.slug] ?? Icon.list}</span>
                  <span className="ent-type-name">{registry.name}</span>
                  <span className="ent-type-family">
                    {registry.authored ? "Author required" : "Read-only · from the corpus"}
                  </span>
                  <span className="ent-type-counts">
                    <strong>{registry.rows.length}</strong> {registry.rows.length === 1 ? "record" : "records"}
                    <em>{registry.columns.length} fields</em>
                  </span>
                  <span className="ent-type-blurb">
                    <span>{registry.blurb}</span>
                  </span>
                  <span className="cfg-registry-sample">{sample.join(" · ")}</span>
                  <span className="ent-type-go">
                    View records <span aria-hidden="true">→</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="cfg-section cfg-management" aria-labelledby="cfg-maintenance">
        <h2 id="cfg-maintenance">Working with registry data</h2>
        <div className="cfg-tiers">
          <article className="cfg-tier"><div className="cfg-tier-head"><strong>Find a record</strong></div><p>Open a registry and search its records. Review the code, name, and supporting fields before using a value in your shipment details.</p></article>
          <article className="cfg-tier"><div className="cfg-tier-head"><strong>Add a reference entry</strong></div><p>Manually maintained registries allow entries to be added locally. Browser additions are for reference only and are not shared with other users or the intake engine.</p></article>
          <article className="cfg-tier"><div className="cfg-tier-head"><strong>Review published data</strong></div><p>Transport modes and counters & locations are read-only references derived from procedures. Their records describe how and where the published steps take place.</p></article>
        </div>
      </section>
    </>
  );
}
