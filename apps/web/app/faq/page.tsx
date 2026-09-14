import Link from "next/link";
import { FAQ, matchFaq } from "../lib/faq";

export const dynamic = "force-dynamic";

export const metadata = { title: "FAQ · UzTrade" };

/** Where the chat sends questions that aren't a shipment. The closest answers
 *  to what was asked come first and open. */
export default async function FaqPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const asked = q.trim();
  const matches = asked ? matchFaq(asked) : [];
  const matched = new Set(matches.map((m) => m.id));
  const entries = [...matches, ...FAQ.filter((f) => !matched.has(f.id))];

  return (
    <>
      <header className="page-head">
        <p>
          <Link href="/" className="crumb">
            Dashboard
          </Link>{" "}
          · FAQ
        </p>
        <h1>Questions and answers</h1>
        {asked ? (
          <p className="page-lede faq-asked">
            You asked &ldquo;{asked}&rdquo;. That isn&rsquo;t a shipment the assistant can open a case for —{" "}
            {matches.length ? "these answers look closest." : "here are the common questions."}
          </p>
        ) : (
          <p className="page-lede">How UzTrade works, what it covers, and what it doesn&rsquo;t do.</p>
        )}
      </header>

      <section className="faq-list" aria-label="Frequently asked questions">
        {entries.map((entry) => (
          <details key={entry.id} className="faq-item" open={matched.has(entry.id)} data-match={matched.has(entry.id) || undefined}>
            <summary>{entry.question}</summary>
            {entry.answer.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {entry.link ? (
              <Link className="crumb" href={entry.link.href}>
                {entry.link.label} →
              </Link>
            ) : null}
          </details>
        ))}
      </section>

      <p className="faq-back">
        <Link className="crumb" href="/">
          ← Back to the chat
        </Link>
      </p>
    </>
  );
}
