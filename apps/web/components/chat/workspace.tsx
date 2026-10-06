"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../icons";
import type { ChatEvent, Stage } from "../../modules/assistant/chat";
import type { ReplyActions } from "../../modules/assistant/say";
import { say } from "../../modules/assistant/say";
import type { CaseSummary } from "../../modules/cases/current-case";
import { rememberCase } from "../../modules/cases/last-case";
import { activeSessionId, getSession, newSessionId, saveSession, setActiveSessionId, titleFor, type StoredMessage } from "../../modules/chat/sessions";
import { demoForNeed } from "../../modules/demo/demo";
import type { IntakeTurn } from "../../modules/intake/conversation";
import { AGENT_STEP_MINUTES } from "../../modules/steps/kpis";
import type { AssistantView } from "../../modules/steps/assistant";
import { briefCase, briefDocumentUpload, briefOpening, briefStep, type Briefing } from "../../modules/steps/briefing";
import type { Need } from "../../modules/steps/next";

type Supported = { id: string; title: string; goods: string; mode: string; direction: string; timeframe?: [number, number] };
type OpenedIntake = Omit<IntakeTurn, "status"> & { status: "opened"; caseId: string; procedureId: string; title: string };

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Still being written: the caret shows. */
  streaming?: boolean;
  actions?: ReplyActions;
  /** The one comparison worth setting apart from the prose. */
  comparison?: { published: string; withAgents: string; saved: string } | null;
  /** A document this reply is waiting for, with the case and step to send it to. */
  upload?: { caseId: string; stepNum: number; needId: string; label: string; demo?: { url: string; file: string; title: string } | null } | null;
  confirmNeed?: { caseId: string; stepNum: number; label: string } | null;
  error?: string;
  /** What the agent did on the way to this answer, in order. */
  steps?: Step[];
  /** When it started working, and how long the answer took. */
  began?: number;
  took?: number;
};

/** One thing the agent did: read the message, looked up the procedure,
 *  checked a document. Shown live while it works, then folded away. */
type Step = { id: string; label: string; state: Stage["state"]; detail?: string };

const seconds = (ms: number) => (ms < 1000 ? "under a second" : `${Math.round(ms / 100) / 10}s`);

const STARTERS = [
  "Export 20 tonnes of tea from Tashkent to Almaty by train",
  "I want to import yoghurt from Almaty by road",
  "Which shipments are waiting on me?",
  "Who issues the phytosanitary certificate for tea?",
];

/** Written fast enough not to wait on, slow enough to read as writing. */
const CHUNK_MS = 16;

/** "go", "yes", "start" - the trader agreeing, in their own words. */
const AGREES = /^\s*(go|yes|yep|yeah|ok(ay)?|sure|start|begin|do it|go ahead|open it|let'?s go|please do)\b/i;

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & { error?: string; missing?: string[] }) | null;
  if (!response.ok) {
    const detail = body?.missing?.length ? `Still needed: ${body.missing.join("; ")}` : body?.error;
    throw new Error(detail ?? fallback);
  }
  if (!body) throw new Error(fallback);
  return body;
}

export default function Workspace({ supported, current }: { supported: Supported[]; current: CaseSummary | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const chatParam = params.get("chat");

  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [turn, setTurn] = useState<IntakeTurn | null>(null);
  const turnRef = useRef<IntakeTurn | null>(null);
  const updateTurn = (next: IntakeTurn | null) => { turnRef.current = next; setTurn(next); };
  const [caseId, setCaseId] = useState<string | null>(current?.id ?? null);
  const [sessionId, setSessionId] = useState<string>(() => newSessionId());

  const input = useRef<HTMLTextAreaElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  /** False once the reader scrolls up: the answer keeps writing, the view stays. */
  const following = useRef(true);
  const seq = useRef(0);
  const nextId = () => `m${(seq.current += 1)}`;
  const started = messages.length > 0;

  /* ----------------------------------------------------------- sessions --- */

  useEffect(() => {
    const restoreId = chatParam || activeSessionId();
    if (!restoreId) return;
    if (chatParam === "new") {
      setMessages([]);
      updateTurn(null);
      const freshId = newSessionId();
      setSessionId(freshId);
      setActiveSessionId(freshId);
      setQuery("");
      router.replace("/");
      input.current?.focus();
      return;
    }
    const session = getSession(restoreId);
    if (!session) return;
    setSessionId(session.id);
    setActiveSessionId(session.id);
    setCaseId(session.caseId);
    updateTurn(session.caseId ? null : session.turn ?? null);
    seq.current = session.messages.length;
    setMessages(session.messages.map((m, i) => ({
      id: `s${i}`, role: m.role, text: m.text,
      actions: !session.caseId && i === session.messages.length - 1 && m.role === "assistant" && session.turn
        ? say({ kind: "intake", turn: session.turn }).actions : undefined,
    })));
  }, [chatParam, router]);

  const remember = useCallback(
    (all: Message[], forCase: string | null) => {
      const spoken = all.filter((m) => m.text.trim() && !m.error);
      if (!spoken.length) return;
      const stored: StoredMessage[] = spoken.map((m) => ({ role: m.role, text: m.text, at: Date.now() }));
      saveSession({
        id: sessionId,
        title: titleFor(spoken.find((m) => m.role === "user")?.text ?? "New chat"),
        messages: stored,
        caseId: forCase,
        turn: forCase ? null : turnRef.current,
      });
      setActiveSessionId(sessionId);
      window.dispatchEvent(new Event("uztrade:chats"));
    },
    [sessionId],
  );

  /* ---------------------------------------------------------- the thread -- */

  /* The thread scrolls, not the page. It follows the answer as it is written,
     but stops following the moment the reader scrolls up - being yanked back
     to the bottom mid-sentence is the worst thing a chat can do. */
  useEffect(() => {
    const el = thread.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onThreadScroll = () => {
    const el = thread.current;
    if (!el) return;
    following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const patch = (id: string, change: (m: Message) => Message) => setMessages((all) => all.map((m) => (m.id === id ? change(m) : m)));

  const write = (id: string, chunk: string) =>
    new Promise<void>((resolve) => {
      patch(id, (m) => ({ ...m, text: m.text + chunk }));
      setTimeout(resolve, CHUNK_MS);
    });

  /** Records one thing the agent did; a running step is replaced when it finishes. */
  const step = (id: string, s: Step) =>
    patch(id, (m) => {
      const steps = m.steps ?? [];
      const at = steps.findIndex((x) => x.id === s.id && x.state === "running");
      return { ...m, steps: at >= 0 ? steps.map((x, i) => (i === at ? s : x)) : [...steps, s] };
    });

  const done = (m: Message): Message => ({ ...m, streaming: false, took: m.began ? Date.now() - m.began : undefined });

  /** Says something the client worked out itself: a briefing, an upload result. */
  const speak = async (lines: string[], extra: Partial<Message> = {}, steps: Step[] = [], began = Date.now()) => {
    const id = nextId();
    setMessages((all) => [...all, { id, role: "assistant", text: "", streaming: true, steps, began }]);
    for (const line of lines) {
      for (const word of line.split(/(\s+)/)) await write(id, word);
      await write(id, "\n\n");
    }
    patch(id, (m) => done({ ...m, text: m.text.trimEnd(), ...extra }));
    return id;
  };

  const ask = async (message: string) => {
    const replyId = nextId();
    setMessages((all) => [...all, { id: replyId, role: "assistant", text: "", streaming: true, steps: [], began: Date.now() }]);
    const active = turn && turn.status !== "declined" ? turn : null;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, draft: active?.draft ?? null, expecting: active?.slot ?? null, caseId }),
      });
      if (!response.ok) await readJson(response, "Request failed");
      if (!response.body) throw new Error("Request failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const handle = async (event: ChatEvent) => {
        if (event.type === "stage") step(replyId, event.stage);
        else if (event.type === "text") await write(replyId, event.chunk);
        else if (event.type === "actions") patch(replyId, (m) => ({ ...m, actions: event.actions }));
        else if (event.type === "result" && event.result.kind === "intake") updateTurn(event.result.turn);
        else if (event.type === "error") patch(replyId, (m) => ({ ...m, error: event.message }));
      };
      for (;;) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) await handle(JSON.parse(line) as ChatEvent);
        }
        if (done) break;
      }
      if (buffer.trim()) await handle(JSON.parse(buffer) as ChatEvent);
      patch(replyId, done);
    } catch (error) {
      patch(replyId, (m) => done({ ...m, error: error instanceof Error ? error.message : "Network error" }));
      throw error;
    }
  };

  const send = async (text?: string) => {
    const message = (text ?? query).trim();
    if (!message || pending) return;

    // A shipment waiting for a yes is opened by the trader saying so, in words.
    const waiting = messages.at(-1);
    const intakeConfirmable = waiting?.role === "assistant" && waiting.actions?.confirm && turn?.status === "confirm";
    const stepConfirmable = waiting?.role === "assistant" && waiting.confirmNeed;

    setPending(true);
    setQuery("");
    following.current = true; // your own message always brings you to the bottom
    setMessages((all) => [...all, { id: nextId(), role: "user", text: message }]);
    try {
      if (stepConfirmable && AGREES.test(message)) await confirmNeed(waiting);
      else if (intakeConfirmable && AGREES.test(message)) await open();
      else await ask(message);
    } catch {
      setQuery(message); // a failed request must not eat what was typed
    }
    setPending(false);
    setMessages((all) => {
      remember(all, caseId);
      return all;
    });
  };

  /* ------------------------------------------------------------- a case --- */

  /** Opens the confirmed shipment and says what happens from here. */
  const open = async () => {
    if (!turn) return;
    const began = Date.now();
    const response = await fetch("/api/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draft: turn.draft, confirm: true }),
    });
    const body = await readJson<IntakeTurn | OpenedIntake>(response, "Could not open the case");

    if (body.status !== "opened" || !body.caseId) {
      updateTurn(body as IntakeTurn);
      await speak([(body as IntakeTurn).message]);
      return;
    }

    const summary = turn.summary;
    rememberCase(body.caseId);
    setCaseId(body.caseId);
    updateTurn(null);

    const view = await readJson<AssistantView>(await fetch(`/api/cases/${body.caseId}/assistant`), "Could not load the next step");
    const published = supported.find((p) => p.id === body.procedureId)?.timeframe ?? view.kpis.etaHours;
    // Intake already wrote the sentence ("Export 20 t of tea from Tashkent to
    // Almaty by train"); reuse it rather than reassembling display strings.
    const shipment = summary ? summary.query.replace(/^(export|import)\s+/i, "") : body.title;
    const opening = briefOpening({
      view,
      shipment,
      direction: summary?.direction ?? "export",
      published,
      agentMinutesEach: AGENT_STEP_MINUTES,
    });

    await speak(
      opening.paragraphs,
      { actions: { caseId: body.caseId }, comparison: opening.comparison },
      [
        { id: "open", label: `Opened case ${body.caseId}`, state: "done" },
        { id: "match", label: "Matched the shipment by goods, route direction and transport mode", state: "done", detail: summary?.caseTitle },
        { id: "plan", label: "Chose the first open steps that are ready to start now", state: "done", detail: `${view.kpis.total} steps in the flow` },
        { id: "agents", label: "Separated what you must sign from what the agents can file", state: "done", detail: `${view.kpis.agentTotal} agent filings` },
      ],
      began,
    );
    await tellNextStep(body.caseId);
    router.refresh();
  };

  const nextView = useCallback(async (id: string): Promise<AssistantView> => {
    let view = await readJson<AssistantView>(await fetch(`/api/cases/${id}/assistant`), "Could not load the next step");
    if (view.next?.ready) {
      view = await readJson<AssistantView>(
        await fetch(`/api/cases/${id}/assistant`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: view.next.lane === "agent" ? "sync" : "complete", stepNum: view.next.stepNum }),
        }),
        "Could not complete the current step",
      );
    }
    return view;
  }, []);

  /** Reads the case and says what to do next. */
  const tellNextStep = useCallback(async (id: string) => {
    const view = await nextView(id);
    if (!view.next) {
      await speak(briefCase(view), { actions: { caseId: id } });
      return;
    }
    const brief: Briefing = briefStep(view.next);
    const uploadNeed = brief.upload ? view.next.needs.find((n) => n.id === brief.upload?.needId) : null;
    const demo = uploadNeed ? demoForNeed(view.procedureId, uploadNeed as Need, view.next.stepNum) : null;
    const confirm = view.next.needs.find((n) => n.kind === "confirm" && n.status !== "have" && !n.optional);
    const lines = [brief.headline, ...brief.paragraphs];
    if (brief.missing.length) lines.push(brief.missing.map((n) => `• ${n.label}${n.optional ? " (optional)" : ""}`).join("\n"));
    await speak(lines, {
      actions: { caseId: id },
      upload: brief.upload
        ? {
            caseId: id,
            stepNum: view.next.stepNum,
            needId: brief.upload.needId,
            label: brief.upload.label,
            demo: demo?.kind === "document" ? { url: demo.url, file: demo.document.file, title: demo.document.title } : null,
          }
        : null,
      confirmNeed: confirm ? { caseId: id, stepNum: view.next.stepNum, label: confirm.label } : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- speak is stable for this component
  }, [nextView]);

  /** The one control a step puts in the conversation. */
  const upload = async (message: Message, file: File) => {
    if (!message.upload || pending) return;
    setPending(true);
    const { caseId: id, stepNum, label } = message.upload;
    patch(message.id, (m) => ({ ...m, upload: null }));
    setMessages((all) => [...all, { id: nextId(), role: "user", text: `Sent ${file.name}` }]);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("stepNum", String(stepNum));
      form.append("label", label);
      const response = await fetch(`/api/cases/${id}/documents`, { method: "POST", body: form });
      const body = await readJson<{ document: Parameters<typeof briefDocumentUpload>[0] }>(response, "The upload failed");

      await speak(briefDocumentUpload(body.document), {}, [
        { id: "read", label: `Read ${file.name}`, state: "done" },
        { id: "check", label: "Checked it against the case", state: "done" },
      ]);
      await tellNextStep(id);
    } catch (error) {
      await speak([], { error: error instanceof Error ? error.message : "The upload failed" });
    }
    setPending(false);
  };

  const uploadDemo = async (message: Message) => {
    if (!message.upload?.demo || pending) return;
    try {
      const response = await fetch(message.upload.demo.url);
      if (!response.ok) throw new Error("Demo document could not be loaded");
      const blob = await response.blob();
      await upload(message, new File([blob], message.upload.demo.file, { type: blob.type || "image/png" }));
    } catch (error) {
      await speak([], { error: error instanceof Error ? error.message : "Demo document could not be loaded" });
      setPending(false);
    }
  };

  const confirmNeed = async (message: Message) => {
    if (!message.confirmNeed || pending) return;
    setPending(true);
    const { caseId: id, stepNum, label } = message.confirmNeed;
    patch(message.id, (m) => ({ ...m, confirmNeed: null }));
    setMessages((all) => [...all, { id: nextId(), role: "user", text: `Confirmed ${label}` }]);
    try {
      const response = await fetch(`/api/cases/${id}/assistant`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "confirm", stepNum, label, value: "yes" }),
      });
      await readJson<AssistantView>(response, "Confirmation failed");
      await speak([`Confirmed ${label.toLowerCase()}.`], {}, [
        { id: "confirm", label: `Recorded ${label}`, state: "done" },
        { id: "refresh", label: "Checked what is still needed for this step", state: "done" },
      ]);
      await tellNextStep(id);
      router.refresh();
    } catch (error) {
      await speak([], { error: error instanceof Error ? error.message : "Confirmation failed" });
    }
    setPending(false);
  };

  /* ------------------------------------------------------------- render --- */

  const composer = (
    <form
      className="composer-form"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <div className="composer">
        <label className="sr-only" htmlFor="trade-query">
          Message
        </label>
        <textarea
          id="trade-query"
          ref={input}
          rows={1}
          value={query}
          placeholder={started ? "Reply, or ask anything…" : "What are you moving, and where to?"}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div className="composer-row">
          <p className="composer-note">{pending ? "Working…" : "Enter to send · Shift+Enter for a new line"}</p>
          <button type="submit" className="send" aria-label="Send" title="Send" disabled={pending || !query.trim()}>
            {Icon.send}
          </button>
        </div>
      </div>
    </form>
  );

  /** The agent's working, the way Claude shows it: one live line naming what it
   *  is doing while nothing is written yet, then a quiet "Worked through …"
   *  line that opens to the list. */
  const reasoning = (m: Message) => {
    const steps = m.steps ?? [];
    if (!steps.length) return null;
    if (m.streaming && !m.text) {
      return (
        <p className="working" aria-live="polite">
          <span className="working-dot" aria-hidden="true" />
          <span className="working-label">{steps.at(-1)!.label}…</span>
        </p>
      );
    }
    const finished = steps.filter((s) => s.state !== "running");
    if (!finished.length) return null;
    return (
      <details className="worked">
        <summary>
          Worked through {finished.length} step{finished.length === 1 ? "" : "s"}
          {m.took && !m.streaming ? ` in ${seconds(m.took)}` : ""}
        </summary>
        <ol>
          {finished.map((s, i) => (
            <li key={`${s.id}-${i}`} data-state={s.state}>
              {s.label}
              {s.detail ? <span> — {s.detail}</span> : null}
            </li>
          ))}
        </ol>
      </details>
    );
  };

  if (!started) {
    return (
      <section className="chat chat-start" aria-label="Trade assistant">
        <div className="start-inner">
          <span className="start-mark" aria-hidden="true">
            UZ
          </span>
          <h1 className="start-title">What are you moving?</h1>
          <p className="start-lede">
            Tell me the goods, where they are going and how. I will find the published procedure, open the case, and take you through it one step
            at a time — filing what I can with the entities myself.
          </p>
          {composer}
          <ul className="start-list">
            {STARTERS.map((s) => (
              <li key={s}>
                <button type="button" onClick={() => send(s)}>
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  return (
    <section className="chat" aria-label="Trade assistant">
      <div className="thread" ref={thread} onScroll={onThreadScroll} role="log" aria-label="Conversation">
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="said">
              <p>{m.text}</p>
            </div>
          ) : (
            <div key={m.id} className="reply">
              {reasoning(m)}

              {m.text ? (
                <div className="reply-text">
                  {m.text.split("\n").map((line, i) =>
                    line.trim() ? (
                      <p key={i} className={line.startsWith("•") ? "reply-item" : undefined}>
                        {line.replace(/^•\s*/, "")}
                      </p>
                    ) : null,
                  )}
                  {m.streaming ? <span className="caret" aria-hidden="true" /> : null}
                </div>
              ) : m.streaming && !m.steps?.length ? (
                <span className="thinking" aria-label="Working">
                  <i />
                  <i />
                  <i />
                </span>
              ) : null}

              {m.comparison && !m.streaming ? (
                <div className="compare">
                  <p>{m.comparison.published}</p>
                  <p className="compare-now">{m.comparison.withAgents}</p>
                  <p className="compare-note">{m.comparison.saved}</p>
                </div>
              ) : null}

              {m.error ? <p className="reply-error">{m.error}</p> : null}

              {m.upload ? (
                <div className="drop-actions">
                  <label className="drop">
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void upload(m, file);
                        event.target.value = "";
                      }}
                    />
                    {Icon.paperclip}
                    <span>Send {m.upload.label.toLowerCase()}</span>
                  </label>
                  {m.upload.demo ? (
                    <button type="button" className="drop-demo" disabled={pending} onClick={() => void uploadDemo(m)} title={m.upload.demo.title}>
                      Demo
                    </button>
                  ) : null}
                </div>
              ) : null}

              {m.confirmNeed ? (
                <div className="confirm-box">
                  <p>{m.confirmNeed.label}</p>
                  <button type="button" disabled={pending} onClick={() => void confirmNeed(m)}>
                    Confirm
                  </button>
                </div>
              ) : null}

              {m.actions?.caseId && !m.streaming ? (
                <Link className="reply-link" href={`/cases/${m.actions.caseId}`}>
                  See the whole case
                </Link>
              ) : null}
            </div>
          ),
        )}
      </div>

      <div className="composer-dock">
        {composer}
        <p className="composer-foot">Figures come from the published procedures. Check anything you file with the entity itself.</p>
      </div>
    </section>
  );
}
