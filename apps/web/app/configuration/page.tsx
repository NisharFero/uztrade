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

const STATS = [
  { value: "23", label: "Registries", detail: "Across four tiers of master data" },
  { value: "1,342", label: "Records read from corpus", detail: "In 14 registries" },
  { value: "223", label: "Records requiring authoring", detail: "In 5 registries" },
  { value: "131", label: "Distinct SLA bands", detail: "For 245 procedures" },
];


export default function ConfigurationPage() {
  const authored = REGISTRIES.filter((r) => r.authored).length;

  return (
    <>
      <header className="page-head">
        <p data-tint="blue">
          <Link href="/" className="crumb">
            Dashboard
          </Link>{" "}
          · Configuration
        </p>
        <h1>Configuration master data</h1>
        <p className="page-lede">
          The registries the platform stands on, and which of them a deployment has to author before the first
          shipment. A specification, not a live reading — nothing on this page is fetched.
        </p>
      </header>

      <section className="cfg-stats" aria-label="Overview">
        {STATS.map((s, i) => (
          <article className="cfg-stat" key={s.label} data-hue={i}>
            <strong>{s.value}</strong>
            <span>{s.label}</span>
            <small>{s.detail}</small>
          </article>
        ))}
      </section>

      <section className="cfg-section" aria-labelledby="cfg-registries">
        <p className="cfg-eyebrow" data-tint="blue">
          <span className="head-icon">{Icon.list}</span>
          Open any registry
        </p>
        <h2 id="cfg-registries">Reference registries</h2>
        <p className="cfg-note">
          <span className="head-icon">{Icon.sparkle}</span>
          {authored} of {REGISTRIES.length} must be authored before the first shipment — nothing in the published
          procedures supplies them. The rest are read from the corpus and refreshed when it is republished.
        </p>
        <div className="cfg-table-wrap">
          <table className="cfg-table">
            <thead>
              <tr>
                <th scope="col">Registry</th>
                <th scope="col">Records</th>
                <th scope="col">Status</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {REGISTRIES.map((r) => (
                <tr key={r.slug} data-authored={r.authored ? "true" : "false"}>
                  <th scope="row">
                    <Link className="cfg-link" href={`/configuration/${r.slug}`}>
                      {r.name}
                      <span aria-hidden="true">→</span>
                    </Link>
                  </th>
                  <td className="cfg-num">{r.rows.length}</td>
                  <td>
                    {/* The word carries the meaning; the tint only repeats it. */}
                    <span className="cfg-status" data-kind={r.authored ? "author" : "read"}>
                      {r.authored ? "Author required" : "Read-only"}
                    </span>
                  </td>
                  <td className="cfg-muted">{r.blurb}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </>
  );
}
