"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Icon } from "../../../components/icons";
import type { Column } from "../master-data";

/* A registry's records, plus the rows this browser has added.
 *
 * Nothing here reaches the backend: added rows live in localStorage under one
 * key per registry and never leave the machine. That is the whole point — the
 * registries are a specification, and this lets someone try a row out against
 * it without a table existing yet. Added rows are therefore marked "Local" and
 * can be removed again, so nobody mistakes them for master data.
 *
 * localStorage can throw (private windows, blocked site data) and can come
 * back empty, so every read and write is guarded and the table renders from
 * the published rows regardless. */

export type Row = Record<string, string | number>;

const keyFor = (slug: string) => `uztrade.registry.${slug}`;

/* A tiny store over the one key, read through useSyncExternalStore rather than
 * hydrated in an effect: the server gets an empty snapshot and the client the
 * stored rows, with no mismatch and no setState during an effect. A write
 * notifies every subscriber, so a second tab follows along. */
const EMPTY: Row[] = [];
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** getSnapshot has to return the same reference until the data really changes,
 *  so the parsed rows are cached against the raw string they came from. */
let cache: { key: string; raw: string | null; rows: Row[] } = { key: "", raw: null, rows: EMPTY };

function read(slug: string): Row[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(keyFor(slug));
  } catch {
    raw = null;
  }
  if (cache.key !== slug || cache.raw !== raw) {
    let rows: Row[] = EMPTY;
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) rows = parsed.filter((r) => r && typeof r === "object");
    } catch {
      rows = EMPTY;
    }
    cache = { key: slug, raw, rows };
  }
  return cache.rows;
}

function write(slug: string, rows: Row[]) {
  try {
    window.localStorage.setItem(keyFor(slug), JSON.stringify(rows));
  } catch {
    // Full or blocked. The rows below still update for this view, which is all
    // that was promised; they just will not survive a reload.
  }
  cache = { key: slug, raw: cache.raw, rows };
  for (const onChange of listeners) onChange();
}

/** The regulatory regime a commodity drags in behind it. Each regime keeps one
 *  hue wherever it appears, so the colour means the regime and nothing else. */
const REGIME = ["Phytosanitary", "Veterinary", "Standard", "Hazardous", "Pharmaceutical"];

export default function RegistryTable({
  slug,
  columns,
  rows,
  authored,
}: {
  slug: string;
  columns: Column[];
  rows: Row[];
  /** Read-only registries are derived from the corpus; they take no new rows. */
  authored: boolean;
}) {
  const added = useSyncExternalStore(
    subscribe,
    () => read(slug),
    () => EMPTY,
  );
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);

  /* Values a column already holds, offered as suggestions when the set is
     small enough to be a real vocabulary rather than free text. */
  const suggestions = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const c of columns) {
      const seen = [...new Set(rows.map((r) => String(r[c.key] ?? "")).filter(Boolean))];
      if (seen.length && seen.length <= 12) out[c.key] = seen.sort((a, b) => a.localeCompare(b));
    }
    return out;
  }, [columns, rows]);

  const first = columns[0];
  const all = [...rows, ...added];

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const key = (draft[first.key] ?? "").trim();
    if (!key) {
      setProblem(`${first.label} is required.`);
      return;
    }
    if (all.some((r) => String(r[first.key]).toLowerCase() === key.toLowerCase())) {
      setProblem(`${first.label} “${key}” is already in this registry.`);
      return;
    }
    const row: Row = {};
    for (const c of columns) row[c.key] = (draft[c.key] ?? "").trim();
    write(slug, [...added, row]);
    setDraft({});
    setProblem(null);
  };

  const remove = (index: number) => write(slug, added.filter((_, i) => i !== index));

  return (
    <>
      <div className="cfg-bar">
        <span className="cfg-status" data-kind={authored ? "author" : "read"}>
          {authored ? "Author required" : "Read-only"}
        </span>
        <span className="cfg-pill">
          {all.length} of {all.length} records
          {added.length ? <em> · {added.length} local</em> : null}
        </span>
        {authored ? (
          <button
            type="button"
            className="cfg-add"
            aria-expanded={open}
            onClick={() => {
              setOpen(!open);
              setProblem(null);
            }}
          >
            <span aria-hidden="true">{open ? Icon.close : Icon.plus}</span>
            {open ? "Cancel" : `Add ${singular(slug)}`}
          </button>
        ) : null}
      </div>

      {open ? (
        <form className="cfg-form" onSubmit={submit}>
          <p className="cfg-form-note">
            <span className="head-icon">{Icon.sparkle}</span>
            Kept in this browser only — nothing is sent anywhere, and it is gone if you clear site data.
          </p>
          <div className="cfg-form-grid">
            {columns.map((c) => (
              <label key={c.key} data-wide={c.wide ? "true" : undefined}>
                <span>
                  {c.label}
                  {c.key === first.key ? <i aria-hidden="true"> *</i> : null}
                </span>
                <input
                  value={draft[c.key] ?? ""}
                  required={c.key === first.key}
                  list={suggestions[c.key] ? `opt-${slug}-${c.key}` : undefined}
                  onChange={(event) => setDraft((prev) => ({ ...prev, [c.key]: event.target.value }))}
                />
                {suggestions[c.key] ? (
                  <datalist id={`opt-${slug}-${c.key}`}>
                    {suggestions[c.key].map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                ) : null}
              </label>
            ))}
          </div>
          {problem ? <p className="cfg-form-problem">{problem}</p> : null}
          <div className="cfg-form-actions">
            <button type="submit" className="prompt prompt-sm">
              Add to this browser
            </button>
          </div>
        </form>
      ) : null}

      <div className="cfg-table-wrap">
        <table className="cfg-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th scope="col" key={c.key} data-numeric={c.numeric ? "true" : undefined}>
                  {c.label}
                </th>
              ))}
              {added.length ? <th scope="col" aria-label="Remove" /> : null}
            </tr>
          </thead>
          <tbody>
            {all.map((row, i) => {
              const local = i >= rows.length;
              return (
                <tr key={String(row[first.key]) + i} data-local={local ? "true" : undefined}>
                  {columns.map((c, col) => {
                    const value = row[c.key];
                    const shown = value === "" || value == null ? "—" : value;
                    const regime = c.key === "regime" && typeof value === "string" ? REGIME.indexOf(value) : -1;

                    if (col === 0) {
                      return (
                        <th scope="row" key={c.key} className="cfg-key">
                          {shown}
                          {local ? <span className="cfg-local">Local</span> : null}
                        </th>
                      );
                    }
                    return (
                      <td
                        key={c.key}
                        className={[c.numeric ? "cfg-num" : "", c.wide ? "" : "cfg-muted"].filter(Boolean).join(" ")}
                        data-numeric={c.numeric ? "true" : undefined}
                      >
                        {regime >= 0 ? (
                          /* The word carries the regime; the hue only repeats it. */
                          <span className="cfg-tag" data-hue={regime}>
                            {shown}
                          </span>
                        ) : (
                          shown
                        )}
                      </td>
                    );
                  })}
                  {added.length ? (
                    <td className="cfg-row-action">
                      {local ? (
                        <button type="button" onClick={() => remove(i - rows.length)} aria-label={`Remove ${row[first.key]}`}>
                          {Icon.close}
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** "Add commodity code", not "Add commodity-codes". */
function singular(slug: string): string {
  const words = slug.replace(/-/g, " ");
  return words.replace(/\b(\w+?)(ies|s)\b$/, (m, stem, end) => (end === "ies" ? `${stem}y` : stem));
}
