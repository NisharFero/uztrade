"use client";

import { useState } from "react";
import type { Act } from "./needs-form";
import type { NoteReading } from "../../modules/steps/note";

/** Tell the agent what happened in one line. What it reads is shown as
 *  proposals - nothing is recorded until you apply one. */
export default function CaseNote({ caseId, busy, onAct }: { caseId: string; busy: string | null; onAct: Act }) {
  const [text, setText] = useState("");
  const [reading, setReading] = useState<NoteReading | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = async () => {
    const note = text.trim();
    if (!note || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/cases/${caseId}/note`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: note }),
      });
      const body = await response.json();
      if (response.ok) setReading(body as NoteReading);
      else setError(body.error ?? "Could not read that");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  };

  const apply = async (index: number) => {
    const proposal = reading?.proposals[index];
    if (!proposal) return;
    await onAct(`note:${proposal.needId}`, { action: proposal.kind, stepNum: proposal.stepNum, label: proposal.label, value: proposal.value });
    setReading({ ...reading!, proposals: reading!.proposals.filter((_, i) => i !== index) });
  };

  return (
    <div className="case-note">
      <label className="wf-detail-h" htmlFor={`note-${caseId}`}>
        Tell the agent what happened
      </label>
      <div className="case-note-row">
        <input
          id={`note-${caseId}`}
          value={text}
          placeholder="e.g. wagon 5 loaded, seals 88421, INN 301234567"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void read();
            }
          }}
        />
        <button type="button" className="prompt prompt-sm" onClick={() => void read()} disabled={pending || !text.trim()}>
          {pending ? "Reading…" : "Read it"}
        </button>
      </div>

      {error ? (
        <p className="query-note" data-tone="error">
          {error}
        </p>
      ) : null}

      {reading ? (
        reading.proposals.length ? (
          <ul className="note-proposals">
            {reading.proposals.map((proposal, index) => (
              <li key={proposal.needId}>
                <span className="plan-main">
                  <strong>
                    {proposal.label}: {proposal.value}
                  </strong>
                  <small>{proposal.why}</small>
                </span>
                <button type="button" className="prompt prompt-sm" disabled={Boolean(busy)} onClick={() => void apply(index)}>
                  Apply
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="needs-meta">
            {reading.model ? "Nothing in that matched what the open steps need." : "No model is configured, so notes can't be read — fill the fields above instead."}
          </p>
        )
      ) : null}

      {reading?.unmatched.length ? <p className="needs-meta">Not placed: {reading.unmatched.join(" · ")}</p> : null}
    </div>
  );
}
