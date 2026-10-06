"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "../icons";
import type { Act, Upload } from "../chat/needs-form";
import { rememberCase } from "../../modules/cases/last-case";
import type { AssistantView } from "../../modules/steps/assistant";
import AgentBlocks from "./agent-blocks";
import { readJson } from "./format";
import Helper from "./helper";
import IntakeBlock from "./intake-block";
import StepBlock from "./step-block";

export type CaseOption = { id: string; title: string; status: string };

/**
 * The dashboard, as blocks rather than a conversation:
 *
 *   no case      the intake block - fields in, matched procedure out, "Start case"
 *   a case       the current step from the orchestrator, and beside it what the
 *                document, risk and transit agents see in the case's records
 *
 * Every action goes to the case API and the view comes back from the
 * orchestrator, so the page always shows the case's real state. The helper
 * beside it answers questions and never moves the case.
 */
export default function Board({ cases, lastCaseId }: { cases: CaseOption[]; lastCaseId: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const param = params.get("case");
  const known = (id: string | null) => (id && cases.some((c) => c.id === id) ? id : null);
  // A reference in the URL is taken as given - a case started a moment ago is
  // not in the server's list until the refresh lands. The last case is only
  // used when it still exists.
  const fromUrl = param && /^UZ-\d{4}-\d{4}$/i.test(param) ? param.toUpperCase() : null;
  const caseId = param === "new" ? null : (fromUrl ?? (param ? null : known(lastCaseId)));

  /* The orchestrator's view, tagged with the case it belongs to, so switching
     cases never shows the previous case's step - not even for a render. */
  const [loaded, setLoaded] = useState<{ id: string; view: AssistantView | null; error: string | null } | null>(null);
  const view = loaded?.id === caseId ? loaded.view : null;
  const loadError = loaded?.id === caseId ? loaded.error : null;
  const setView = (next: AssistantView) => caseId && setLoaded({ id: caseId, view: next, error: null });

  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [helperOpen, setHelperOpen] = useState(false);
  const [prompt, setPrompt] = useState<{ text: string; at: number } | null>(null);

  useEffect(() => {
    if (!caseId) return;
    rememberCase(caseId);
    let live = true;
    fetch(`/api/cases/${caseId}/assistant`)
      .then((r) => readJson<AssistantView>(r, "Could not load the case"))
      .then((next) => {
        if (!live) return;
        setLoaded({ id: caseId, view: next, error: null });
        setVersion((v) => v + 1);
      })
      .catch((e: Error) => live && setLoaded({ id: caseId, view: null, error: e.message }));
    return () => {
      live = false;
    };
  }, [caseId]);

  const select = (id: string | null) => {
    setProblem(null);
    router.push(id ? `/?case=${encodeURIComponent(id)}` : "/?case=new");
  };

  /** One action on the case; the orchestrator's refreshed view comes back. */
  const act: Act = async (key, payload) => {
    if (!caseId) return;
    setBusy(String(payload.action) === "complete" || String(payload.action) === "sync" ? String(payload.action) : key);
    setProblem(null);
    try {
      const response = await fetch(`/api/cases/${caseId}/assistant`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = (await response.json().catch(() => ({}))) as AssistantView & { error?: string; missing?: string[] };
      if (response.status === 422) setProblem(`Not ready yet — still needed: ${(body.missing ?? []).join(", ") || body.error}`);
      else if (!response.ok) setProblem(body.error || "That did not go through");
      else {
        setView(body);
        setVersion((v) => v + 1);
      }
    } catch {
      setProblem("That did not go through — check your connection and try again.");
    }
    setBusy(null);
  };

  const upload: Upload = async (need, stepNum, file) => {
    if (!caseId) return;
    setBusy(`upload:${need.id}`);
    setProblem(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("stepNum", String(stepNum));
      form.append("label", need.label);
      const body = await readJson<{ view: AssistantView }>(await fetch(`/api/cases/${caseId}/documents`, { method: "POST", body: form }), "The upload failed");
      setView(body.view);
      setVersion((v) => v + 1);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "The upload failed");
    }
    setBusy(null);
  };

  const askHelper = (text: string) => {
    setPrompt({ text, at: Date.now() });
    setHelperOpen(true);
  };

  // No router.refresh() here: straight after a push it cancels the navigation.
  // The URL carries the new case, and the sidebar re-reads cases on navigation.
  const started = (id: string) => {
    rememberCase(id);
    router.push(`/?case=${encodeURIComponent(id)}`);
  };

  // A case started a moment ago is not in the server's list yet; the view knows it.
  const options: CaseOption[] =
    caseId && !cases.some((c) => c.id === caseId) && view ? [{ id: caseId, title: view.title, status: view.status }, ...cases] : cases;
  const current = caseId ? options.find((c) => c.id === caseId) : null;

  return (
    <div className={helperOpen ? "board has-helper" : "board"}>
      <header className="board-head">
        <div>
          <p className="board-kicker">
            <span className="head-icon">{Icon.home}</span> Dashboard
          </p>
          <h1>{current ? current.title : "Start a shipment"}</h1>
          <p className="board-lede">
            {current
              ? `Case ${current.id}. One step at a time, straight from the workflow — the agents file what they can.`
              : "Tell us what you are moving. The intake agent matches the published procedure before anything is opened."}
          </p>
        </div>
        <div className="board-tools">
          {options.length ? (
            <label className="case-picker">
              <span className="sr-only">Case</span>
              <select value={caseId ?? ""} onChange={(e) => select(e.target.value || null)}>
                <option value="">New shipment</option>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} · {c.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {caseId ? (
            <button type="button" className="secondary" onClick={() => select(null)}>
              {Icon.plus} New shipment
            </button>
          ) : null}
          <button type="button" className="secondary" onClick={() => setHelperOpen((o) => !o)} aria-expanded={helperOpen}>
            {Icon.sparkle} Ask
          </button>
        </div>
      </header>

      <div className="board-body">
        <div className="board-grid" data-mode={caseId ? "case" : "intake"}>
          <div className="board-main">
            {caseId ? (
              view ? (
                <StepBlock view={view} busy={busy} problem={problem} onAct={act} onUpload={upload} onAsk={askHelper} />
              ) : (
                <section className="block">
                  <p className="block-hint">{loadError ?? "Loading the current step…"}</p>
                </section>
              )
            ) : (
              <IntakeBlock onStarted={started} />
            )}
            {caseId && view ? (
              <p className="board-links">
                <Link href={`/cases/${caseId}`}>Whole workflow</Link>
                <Link href={`/ledger?case=${caseId}`}>Ledger & entity records</Link>
              </p>
            ) : null}
          </div>

          {caseId && view ? (
            <aside className="board-side" aria-label="Agents">
              <AgentBlocks view={view} version={version} onExplain={askHelper} />
            </aside>
          ) : !caseId && cases.length ? (
            <aside className="board-side" aria-label="Your cases">
              <section className="block agent-block">
                <header className="agent-head">
                  <span className="block-icon">{Icon.list}</span>
                  <h3>Your cases</h3>
                </header>
                <ul className="agent-list">
                  {cases.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <span data-tone={c.status === "completed" ? "ok" : "caution"}>{c.status === "completed" ? "✓" : "·"}</span>
                      <div>
                        <strong>{c.title}</strong>
                        <small>{c.id}</small>
                      </div>
                      <button type="button" className="link" onClick={() => select(c.id)}>
                        Open
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </aside>
          ) : null}
        </div>

        <Helper open={helperOpen} onClose={() => setHelperOpen(false)} caseId={caseId} prompt={prompt} />
      </div>
    </div>
  );
}
