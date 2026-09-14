"use client";

import { specFor } from "../lib/document-specs";
import { INPUT_KINDS, type StepInput, type StepNeeds } from "../lib/requirements";

/** One input line. Documents expand to what they must contain and what the
 *  agent cross-checks; everything else is a plain line. */
function InputItem({ input, waiting }: { input: StepInput; waiting: boolean }) {
  const spec = input.docType ? specFor(input.docType) : null;
  const meta = input.producedBy
    ? `from step ${input.producedBy.stepNum}${waiting ? " — not produced yet" : ""}`
    : input.optional
      ? "optional"
      : null;
  const label = (
    <>
      <span>{input.label}</span>
      {meta ? (
        <small className="needs-meta" data-waiting={waiting || undefined}>
          {meta}
        </small>
      ) : null}
    </>
  );

  if (!spec) return <li className="needs-item">{label}</li>;

  return (
    <li className="needs-item">
      <details className="doc-spec">
        <summary>{label}</summary>
        <p className="doc-spec-purpose">{spec.purpose}</p>
        <span className="doc-spec-h">Must contain</span>
        <ul>
          {spec.fields.map((f) => (
            <li key={f.name}>
              {f.name} <em data-source={f.source}>{f.source === "reference" ? "reference practice" : f.source}</em>
            </li>
          ))}
        </ul>
        {spec.supporting.length ? (
          <>
            <span className="doc-spec-h">Must come with</span>
            <ul>
              {spec.supporting.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </>
        ) : null}
        <span className="doc-spec-h">Agent checks</span>
        <ul>
          {spec.checks.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </details>
    </li>
  );
}

/** What one step needs, as points grouped by where each input comes from;
 *  alternative channels ("pay at a branch" / "pay online") listed as either. */
export function StepNeedsList({ needs, isCompleted }: { needs: StepNeeds; isCompleted: (stepNum: number) => boolean }) {
  const waiting = (i: StepInput) => Boolean(i.producedBy && !i.optional && !isCompleted(i.producedBy.stepNum));
  const groups = INPUT_KINDS.map((k) => ({ ...k, inputs: needs.common.filter((i) => i.kind === k.kind) })).filter(
    (g) => g.inputs.length,
  );

  if (!groups.length && !needs.variants.length) return <p className="needs-empty">No inputs listed for this step.</p>;

  return (
    <div className="step-needs">
      {groups.map((g) => (
        <div key={g.kind} className="needs-kind" data-kind={g.kind}>
          <span className="needs-kind-h">{g.label}</span>
          <ul className="needs-list">
            {g.inputs.map((i) => (
              <InputItem key={i.label} input={i} waiting={waiting(i)} />
            ))}
          </ul>
        </div>
      ))}
      {needs.variants.length ? (
        <div className="needs-kind" data-kind="variant">
          <span className="needs-kind-h">Either one of</span>
          <ul className="needs-list">
            {needs.variants.map((v) => (
              <li key={v.label} className="needs-item">
                <span>{v.label}</span>
                <small className="needs-meta">{v.inputs.map((i) => i.label).join(" · ") || "—"}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
