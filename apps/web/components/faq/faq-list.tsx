"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { FaqEntry } from "../../modules/faq/faq";

/** The FAQ with a search box: typing opens every answer that mentions the
 *  words; the answers closest to a question sent from the chat stay open. */
export default function FaqList({ entries, matched }: { entries: FaqEntry[]; matched: string[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => (q ? entries.filter((e) => [e.question, ...e.answer, ...e.keywords].join(" ").toLowerCase().includes(q)) : entries),
    [entries, q],
  );

  return (
    <>
      <label className="faq-search">
        <span className="sr-only">Search questions and answers</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search questions and answers" />
      </label>

      {shown.length ? (
        <section className="faq-list" aria-label="Frequently asked questions">
          {shown.map((entry) => (
            <details key={entry.id} className="faq-item" open={Boolean(q) || matched.includes(entry.id)} data-match={matched.includes(entry.id) || undefined}>
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
      ) : (
        <p className="needs-empty">
          Nothing here mentions &ldquo;{query.trim()}&rdquo;.{" "}
          <Link className="crumb" href="/">
            Ask the assistant instead →
          </Link>
        </p>
      )}
    </>
  );
}
