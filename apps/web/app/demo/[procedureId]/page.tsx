import Link from "next/link";
import { notFound } from "next/navigation";
import { PROCEDURES } from "../../data/procedures.generated";
import { demoFileUrl, demoFor } from "../../lib/demo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ procedureId: string }> }) {
  const { procedureId } = await params;
  return { title: `Demo pack ${procedureId} · UzTrade` };
}

/** Every demo document and value for a procedure, to download and upload by hand
 *  or to use from the step assistant's "Use demo" buttons. */
export default async function DemoPage({ params }: { params: Promise<{ procedureId: string }> }) {
  const { procedureId } = await params;
  const scenario = demoFor(procedureId);
  const procedure = PROCEDURES[procedureId];
  if (!scenario || !procedure) notFound();

  return (
    <>
      <header className="page-head">
        <p>
          <Link href="/cases" className="crumb">
            Cases &amp; Shipments
          </Link>{" "}
          · Demo pack
        </p>
        <h1>{scenario.title}</h1>
        <p className="page-lede">
          {scenario.note} Use them from the step assistant&rsquo;s &ldquo;Use demo&rdquo; buttons, or download a file and upload it at the step
          that asks for it. Shipment: {String(scenario.shipment.query)}.
        </p>
      </header>

      <section className="demo-values" aria-label="Demo values">
        <h2>Values</h2>
        <div className="risk-table-wrap">
          <table className="risk-table">
            <tbody>
              {Object.entries(scenario.values).map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="demo-grid" aria-label="Demo documents">
        {scenario.documents.map((doc) => {
          const url = demoFileUrl(procedureId, doc);
          return (
            <article className="demo-card" key={doc.id}>
              <a href={url} target="_blank" rel="noreferrer" className="demo-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element -- static demo previews */}
                <img src={url} alt={doc.title} loading="lazy" width={310} height={438} />
              </a>
              <h3>{doc.title}</h3>
              <p className="needs-meta">
                {doc.output ? "Output of" : "Needed at"} step{doc.steps.length > 1 ? "s" : ""} {doc.steps.join(", ")}
                {doc.docType ? ` · parsed as ${doc.docType.replace(/_/g, " ")}` : " · stored, not parsed"}
              </p>
              <a className="prompt" href={url} download={doc.file}>
                Download
              </a>
            </article>
          );
        })}
      </section>
    </>
  );
}
