"use client";

import { useState } from "react";
import { Icon } from "../icons";
import type { IntakeDraft } from "../../modules/intake/draft";
import type { IntakePreview } from "../../modules/intake/preview";
import { hours, plural, readJson } from "./format";

type Fields = { direction: string; goods: string; quantity: string; unit: string; origin: string; destination: string; mode: string };

const EMPTY: Fields = { direction: "", goods: "", quantity: "", unit: "tonnes", origin: "", destination: "", mode: "" };
const CITIES = ["Tashkent", "Samarkand", "Andijan", "Bukhara", "Almaty", "Moscow", "Bishkek", "Istanbul", "Urumqi", "Tehran"];
const EXAMPLES = [
  "Export 20 tonnes of tea from Tashkent to Almaty by train",
  "Import 12 tonnes of yoghurt from Almaty to Tashkent by road",
  "Export 500 kg of dried apricots to Moscow by air",
];

/** The fields a draft already holds, so free text fills the form in. */
function fieldsOf(draft: IntakeDraft, before: Fields): Fields {
  return {
    direction: draft.statedDirection ?? before.direction,
    goods: draft.commodity?.term ?? draft.pendingTerm ?? before.goods,
    quantity: draft.quantity ? String(draft.quantity.value) : before.quantity,
    unit: draft.quantity?.unit ? (/^t/.test(draft.quantity.unit) ? "tonnes" : draft.quantity.unit) : before.unit,
    origin: draft.origin && !draft.origin.assumed ? draft.origin.name : before.origin,
    destination: draft.destination && !draft.destination.assumed ? draft.destination.name : before.destination,
    mode: draft.mode ?? before.mode,
  };
}

/**
 * Block 1: the shipment, as a form. The intake agent reads it, names the
 * procedure it matches, and says how long it takes and what it will ask for.
 * The case is opened only by "Start case".
 */
export default function IntakeBlock({ onStarted }: { onStarted: (caseId: string) => void }) {
  const [line, setLine] = useState("");
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [preview, setPreview] = useState<IntakePreview | null>(null);
  const [busy, setBusy] = useState<"match" | "start" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof Fields) => (event: { target: { value: string } }) => {
    setFields((f) => ({ ...f, [key]: event.target.value }));
    setPreview(null); // the match was for the old fields
  };

  const run = async (body: Record<string, unknown>) => {
    setBusy("match");
    setError(null);
    try {
      const result = await readJson<IntakePreview>(
        await fetch("/api/intake/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
        "Could not read the shipment",
      );
      setPreview(result);
      setFields((f) => fieldsOf(result.turn.draft, f));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the shipment");
    }
    setBusy(null);
  };

  const matchFields = () => run({ fields });
  const matchLine = (text = line) => text.trim() && run({ message: text.trim(), draft: preview?.turn.draft, expecting: preview?.turn.slot ?? null });
  const choose = (reply: string) => preview && run({ message: reply, draft: preview.turn.draft, expecting: preview.turn.slot ?? null });

  const start = async () => {
    if (!preview) return;
    setBusy("start");
    setError(null);
    try {
      const opened = await readJson<{ status: string; caseId?: string; message?: string }>(
        await fetch("/api/intake", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft: preview.turn.draft, confirm: true }) }),
        "Could not open the case",
      );
      if (opened.status !== "opened" || !opened.caseId) throw new Error(opened.message || "A detail no longer holds - match again");
      onStarted(opened.caseId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the case");
    }
    setBusy(null);
  };

  const turn = preview?.turn;
  const matched = preview?.procedure && turn?.status === "confirm" ? preview.procedure : null;
  const missing = turn && turn.status !== "confirm" ? turn.progress.filter((p) => !p.done).map((p) => p.label.toLowerCase()) : [];

  return (
    <section className="block intake-block" aria-labelledby="intake-title">
      <header className="block-head">
        <span className="block-icon">{Icon.truck}</span>
        <div>
          <h2 id="intake-title">New shipment</h2>
          <p>Describe it in a line, or fill in the details. Nothing is opened until you start the case.</p>
        </div>
      </header>

      <form
        className="intake-line"
        onSubmit={(event) => {
          event.preventDefault();
          void matchLine();
        }}
      >
        <label className="sr-only" htmlFor="intake-line">
          Describe the shipment
        </label>
        <input
          id="intake-line"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          placeholder="e.g. export 20 tonnes of tea from Tashkent to Almaty by train"
          autoComplete="off"
        />
        <button type="submit" disabled={busy !== null || !line.trim()}>
          {busy === "match" ? "Reading…" : "Read it"}
        </button>
      </form>
      <p className="intake-examples">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            className="chip"
            onClick={() => {
              setLine(example);
              void matchLine(example);
            }}
          >
            {example}
          </button>
        ))}
      </p>

      <form
        className="intake-fields"
        onSubmit={(event) => {
          event.preventDefault();
          void matchFields();
        }}
      >
        <label>
          <span>Direction</span>
          <select value={fields.direction} onChange={set("direction")}>
            <option value="">Export or import?</option>
            <option value="export">Export from Uzbekistan</option>
            <option value="import">Import into Uzbekistan</option>
          </select>
        </label>
        <label>
          <span>Goods</span>
          <input value={fields.goods} onChange={set("goods")} placeholder="tea, cement, yoghurt…" />
        </label>
        <label className="intake-qty">
          <span>Quantity</span>
          <div>
            <input value={fields.quantity} onChange={set("quantity")} inputMode="decimal" placeholder="20" />
            <select value={fields.unit} onChange={set("unit")} aria-label="Unit">
              <option value="tonnes">tonnes</option>
              <option value="kg">kg</option>
              <option value="wagons">wagons</option>
              <option value="trucks">trucks</option>
            </select>
          </div>
        </label>
        <label>
          <span>Transport</span>
          <select value={fields.mode} onChange={set("mode")}>
            <option value="">How does it travel?</option>
            <option value="train">Train</option>
            <option value="road">Road</option>
            <option value="air">Air</option>
          </select>
        </label>
        <label>
          <span>From</span>
          <input value={fields.origin} onChange={set("origin")} list="intake-cities" placeholder="Tashkent" />
        </label>
        <label>
          <span>To</span>
          <input value={fields.destination} onChange={set("destination")} list="intake-cities" placeholder="Almaty" />
        </label>
        <datalist id="intake-cities">
          {CITIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <div className="intake-submit">
          <button type="submit" disabled={busy !== null || !fields.goods.trim()}>
            {busy === "match" ? "Matching…" : "Match procedure"}
          </button>
        </div>
      </form>

      {error ? <p className="block-error">{error}</p> : null}

      {preview ? (
        <div className="intake-result" aria-live="polite">
          {preview.fixes.length ? (
            <p className="intake-note">Read {preview.fixes.map((f) => `“${f.from}” as “${f.to}”`).join(", ")}.</p>
          ) : null}

          {matched ? (
            <>
              <p className="intake-match">
                I matched this to <strong>{matched.title}</strong>, procedure {matched.id}.
              </p>
              <dl className="intake-facts">
                <div>
                  <dt>Usually</dt>
                  <dd>{hours(matched.published)}</dd>
                </div>
                <div>
                  <dt>With the agents</dt>
                  <dd>{hours(preview.timing?.paperwork ?? matched.published)}</dd>
                </div>
                {preview.timing?.doorToDoor ? (
                  <div>
                    <dt>Door to door</dt>
                    <dd>{hours(preview.timing.doorToDoor)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Stages</dt>
                  <dd>
                    {matched.stages} <small>· {plural(matched.steps, "step")}, {matched.online} online</small>
                  </dd>
                </div>
              </dl>
              {preview.needs ? (
                <p className="intake-needs">
                  Along the way: {plural(preview.needs.documents.length, "document")}
                  {preview.needs.documents.length ? ` (${preview.needs.documents.slice(0, 3).join(", ").toLowerCase()}${preview.needs.documents.length > 3 ? "…" : ""})` : ""} and{" "}
                  {plural(preview.needs.details.length, "detail")}. Each is asked for at its own step.
                </p>
              ) : null}
              <div className="block-actions">
                <button type="button" onClick={start} disabled={busy !== null}>
                  {busy === "start" ? "Opening…" : "Start case"}
                </button>
                <span className="block-hint">Opens the case and its first step.</span>
              </div>
            </>
          ) : (
            <>
              <p className="intake-match">{turn?.message}</p>
              {turn?.options.length ? (
                <p className="intake-options">
                  {turn.options.map((o) => (
                    <button key={o.reply} type="button" className="chip" onClick={() => choose(o.reply)} disabled={busy !== null}>
                      {o.label}
                    </button>
                  ))}
                </p>
              ) : null}
              {missing.length ? <p className="intake-note">Still needed: {missing.join(", ")}.</p> : null}
              {preview.estimate?.options.length ? (
                <ul className="intake-ways">
                  {preview.estimate.options.map((o) => (
                    <li key={o.procedureId}>
                      <span>
                        {o.direction === "export" ? "Export" : "Import"} by {o.mode}
                      </span>
                      <small>
                        {hours(o.published)} · {plural(o.steps, "step")}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
