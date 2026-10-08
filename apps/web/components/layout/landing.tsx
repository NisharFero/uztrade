import Link from "next/link";
import { Icon } from "../icons";

const destinations = [
  { href: "/dashboard", page: "Dashboard", audience: "Administrators", role: "Trade oversight", icon: "dashboard", tone: "navy", description: "Review shipments and case progress. Open a case, see the next required action, and follow the work assigned to traders and agents." },
  { href: "/configuration", page: "Configuration", audience: "Platform managers", role: "Settings & master data", icon: "sliders", tone: "amber", description: "Maintain the records and settings used across the platform, including users, organizations, countries, and trade classifications." },
  { href: "/agents", page: "AI Agent Center", audience: "Operations teams", role: "Agent coordination", icon: "bot", tone: "blue", description: "Review the agents responsible for document checks, compliance, and workflow coordination. Understand their responsibilities and where a person must act." },
  { href: "/entities", page: "Entities", audience: "Issuing bodies & partners", role: "Institutions & service providers", icon: "landmark", tone: "green", description: "Find the organizations involved in each procedure. Review their services, contact information, and available portal integrations." },
  { href: "/procedures", page: "Procedures", audience: "Importers & exporters", role: "Trade requirements", icon: "book", tone: "fuchsia", description: "Find the published procedure for your goods and transport mode. Review the steps, required documents, responsible entities, and published timeframes." },
];

export default function Landing() {
  return (
    <div className="trade-entry">
      <header className="trade-header">
        <Link href="/" className="trade-brand" aria-label="UzOne home"><span aria-hidden="true">{Icon.landmark}</span><strong>UzOne</strong></Link>
        <span className="trade-header-label">Uzbekistan</span>
      </header>
      <section className="trade-intro" aria-labelledby="entry-title">
        <h1 id="entry-title">UzOne Trade Platform</h1>
        <p>Access trade procedures, shipment cases, participating institutions, and the agents that support them.</p>
      </section>
      <section className="trade-workspaces" aria-labelledby="workspace-title">
        <h2 id="workspace-title">Continue as</h2>
        <div className="trade-grid">
          {destinations.map(item => (
            <Link className="trade-card" data-tone={item.tone} href={item.href} key={item.href}>
              <span className="trade-role-label">{item.role}</span>
              <div className="trade-person"><span className="trade-card-icon">{Icon[item.icon]}</span><h3>{item.audience}</h3></div>
              <p>{item.description}</p>
              <span className="trade-card-open">{item.page}<span aria-hidden="true">→</span></span>
            </Link>
          ))}
        </div>
      </section>
      <footer className="trade-footer"><span>UzOne · Uzbekistan</span><Link href="/faq">Help & frequently asked questions <span aria-hidden="true">→</span></Link></footer>
    </div>
  );
}
