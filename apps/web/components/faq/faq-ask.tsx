"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FaqAnswer } from "../../modules/faq/answer";

/** Ask the published procedures: an answer only when a model can cite the
 *  passages it comes from, and those passages every time. */
export default function FaqAsk({ initial }: { initial: string }) {
  const [draft, setDraft] = useState(initial);
  const [asked, setAsked] = useState(initial);
  const [result, setResult] = useState<FaqAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!asked) return;
    let live = true;
    fetch("/api/faq/answer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: asked }) })
      .then(async (response) => {
        const body = await response.json();
        if (!live) return;
        if (response.ok) setResult(body as FaqAnswer);
        else setError(body.error ?? "Could not answer that");
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Network error"));
    return () => {
      live = false;
    };
  }, [asked]);

  const current = result?.question === asked ? result : null;
  const pending = Boolean(asked) && !error && !current;

  return (
    <section className="faq-ask" aria-label="Ask the procedures">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const question = draft.trim();
          if (!question) return;
          setError(null);
          setAsked(question);
        }}
      >
        <label className="sr-only" htmlFor="faq-question">
          Question about the procedures
        </label>
        <input
          id="faq-question"
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask the procedures, e.g. who issues the phytosanitary certificate for tea?"
        />
        <button type="submit" className="intake-create" disabled={pending}>
          {pending ? "Looking…" : "Ask"}
        </button>
      </form>

      {error ? (
        <p className="query-note" data-tone="error">
          {error}
        </p>
      ) : null}

      {current ? (
        current.found && current.answer ? (
          <div className="faq-answer">
            <p>{current.answer}</p>
            <small className="needs-meta">From the published procedures{current.model ? `, written by ${current.model}` : ""} — only what the numbered sources say.</small>
          </div>
        ) : (
          <p className="needs-meta">
            {current.withheld ? `${current.withheld} ` : ""}
            {!current.sources.length
              ? "Nothing in the procedures matches that question."
              : current.by === "retrieval" && !current.model
                ? "The closest passages in the procedures:"
                : "The procedures don't answer that directly. The closest passages:"}
          </p>
        )
      ) : null}

      {current?.sources.length ? (
        <ol className="faq-sources">
          {current.sources.map((s) => (
            <li key={s.id}>
              <strong>{s.href ? <Link href={s.href}>{s.title}</Link> : s.title}</strong>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
