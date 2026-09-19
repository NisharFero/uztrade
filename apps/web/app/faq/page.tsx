import Link from "next/link";
import { FAQ, matchFaq } from "../../modules/faq/faq";
import FaqAsk from "../../components/faq/faq-ask";
import FaqList from "../../components/faq/faq-list";

export const dynamic = "force-dynamic";

export const metadata = { title: "FAQ · UzTrade" };

/** The FAQ, linked from the chat's answers. The closest answers
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
            You asked &ldquo;{asked}&rdquo; —{" "}
            {matches.length ? "these answers look closest." : "here are the common questions."}
          </p>
        ) : (
          <p className="page-lede">How UzTrade works, what it covers, and what it doesn&rsquo;t do.</p>
        )}
      </header>

      <FaqAsk key={asked} initial={asked} />

      <FaqList entries={entries} matched={[...matched]} />

      <p className="faq-back">
        <Link className="crumb" href="/">
          ← Back to the chat
        </Link>
      </p>
    </>
  );
}
