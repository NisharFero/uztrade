"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons";
import type { ProcedureQaAnswer } from "../../modules/steps/procedure-qa";
import type { ChatEvent } from "../../modules/assistant/chat";
import { readJson } from "./format";

type Turn = { id: number; question: string; answer: string | null; bullets: string[]; error?: string };

/**
 * The side helper: ask about this step, explain this document. It answers from
 * the case and the published procedures, and it never moves the workflow - the
 * step block and the orchestrator do that.
 */
export default function Helper({
  open,
  onClose,
  caseId,
  prompt,
}: {
  open: boolean;
  onClose: () => void;
  caseId: string | null;
  /** A question to ask as soon as the panel opens ("Ask about this step"). */
  prompt: { text: string; at: number } | null;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const asked = useRef<number | null>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [turns]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const id = (seq.current += 1);
    setTurns((t) => [...t, { id, question: q, answer: null, bullets: [] }]);
    setDraft("");
    setBusy(true);
    const put = (patch: Partial<Turn>) => setTurns((t) => t.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      if (caseId) {
        const body = await readJson<{ answer: ProcedureQaAnswer }>(
          await fetch(`/api/cases/${caseId}/assistant`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ask", question: q }) }),
          "Could not answer that",
        );
        put({ answer: body.answer.message, bullets: body.answer.bullets ?? [] });
      } else {
        const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: q, draft: null, expecting: null }) });
        if (!response.ok || !response.body) throw new Error("Could not answer that");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let text = "";
        for (;;) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          let at: number;
          while ((at = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, at).trim();
            buffer = buffer.slice(at + 1);
            if (!line) continue;
            const event = JSON.parse(line) as ChatEvent;
            if (event.type === "text") {
              text += event.chunk;
              put({ answer: text });
            } else if (event.type === "error") throw new Error(event.message);
          }
          if (done) break;
        }
      }
    } catch (error) {
      put({ error: error instanceof Error ? error.message : "Could not answer that" });
    }
    setBusy(false);
  };

  // "Ask about this step" and "Explain" open the panel with their question.
  useEffect(() => {
    if (open && prompt && asked.current !== prompt.at) {
      asked.current = prompt.at;
      void ask(prompt.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ask reads the latest state when called
  }, [open, prompt]);

  if (!open) return null;

  return (
    <aside className="helper" aria-label="Helper">
      <header className="helper-head">
        <div>
          <h3>Ask the assistant</h3>
          <p>{caseId ? `About ${caseId}: its steps, documents and procedure.` : "About the published procedures."} It answers; it does not move the case.</p>
        </div>
        <button type="button" className="icon-button" aria-label="Close helper" onClick={onClose}>
          {Icon.close}
        </button>
      </header>

      <div className="helper-thread" ref={list}>
        {turns.length === 0 ? <p className="helper-empty">Ask what a step needs, who issues a certificate, or what a document is for.</p> : null}
        {turns.map((t) => (
          <div key={t.id} className="helper-turn">
            <p className="helper-q">{t.question}</p>
            {t.error ? (
              <p className="block-error">{t.error}</p>
            ) : t.answer === null ? (
              <p className="helper-wait">Looking it up…</p>
            ) : (
              <div className="helper-a">
                {t.answer.split(/\n{2,}/).map((para, i) => (para.trim() ? <p key={i}>{para.trim()}</p> : null))}
                {t.bullets.length ? (
                  <ul>
                    {t.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        className="helper-form"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(draft);
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask a question…" aria-label="Question" />
        <button type="submit" disabled={busy || !draft.trim()} aria-label="Ask">
          {Icon.send}
        </button>
      </form>
    </aside>
  );
}
