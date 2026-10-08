"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../icons";
import type { Act, Upload } from "./needs-form";
import AgentRail, { Avatar } from "./agent-rail";
import StepBlock from "../dashboard/step-block";
import { plural, readJson } from "../dashboard/format";
import { CaseCard, CasesCard, PlanCard, RiskCard, ShipmentProgress, SourcesCard, StarterCards, WaysCard, type Starter } from "./result-cards";
import type { ChatEvent, ChatResult, FollowUp, Stage } from "../../modules/assistant/chat";
import type { ReplyActions } from "../../modules/assistant/say";
import { rememberCase } from "../../modules/cases/last-case";
import { AGENTS, agentStatuses, riskSummary, type AgentId } from "../../modules/chat/agents";
import type { RiskReport } from "../../modules/compliance/risk";
import type { IntakeTurn } from "../../modules/intake/conversation";
import { confirmsShipment } from "../../modules/intake/confirmation";
import { restoreIntake, saveIntake } from "../../modules/intake/checkpoint";
import { brief } from "../../modules/assistant/say";
import { briefDocumentUpload } from "../../modules/steps/briefing";
import type { AssistantView } from "../../modules/steps/assistant";
import type { ProcedureQaAnswer } from "../../modules/steps/procedure-qa";
import type { TransitView } from "../../modules/transit/transit";

type Who = AgentId | "user";

/** One thing an agent did on the way to its answer, shown live, then folded. */
type Step = { id: string; label: string; state: Stage["state"]; detail?: string };

type Message = {
  id: string;
  who: Who;
  text: string;
  streaming?: boolean;
  error?: string;
  steps?: Step[];
  began?: number;
  took?: number;
  /** Taps that answer the question just asked ("Fresh apricots", "By train"). */
  options?: { label: string; text: string }[];
  /** The shipment is matched: the trader can open the case. */
  confirm?: ReplyActions["confirm"];
  /** This message carries the orchestrator's step card for that step. */
  step?: { num: number; title: string };
  /** What the agent found, drawn as a card under the one-line reply. */
  result?: ChatResult;
  /** Next messages worth one tap, when the reply asks no question of its own. */
  followUps?: FollowUp[];
  /** A card the client draws from the case itself. */
  card?: { kind: "case" } | { kind: "risk"; report: RiskReport };
};

const STARTERS: Starter[] = [
  { kind: "Start a shipment", text: "Export 20 tonnes of tea from Tashkent to Almaty by train", glyph: "truck" },
  { kind: "Explore", text: "I want to import yoghurt from Almaty", glyph: "compose" },
  { kind: "Your cases", text: "Which shipments are waiting on me?", glyph: "shipments" },
  { kind: "Ask the procedures", text: "Who issues the phytosanitary certificate for tea?", glyph: "book" },
];

/** What to start typing when a filled detail is tapped to change it. */
const CORRECT: Record<string, string> = {
  commodity: "Actually it's ",
  direction: "Actually it's an ",
  mode: "Send it by ",
  regime: "Treatment: ",
  quantity: "Make it ",
  route: "Actually from ",
};

/** "yes", "go ahead", "open it": the trader agreeing, in their own words. */
const CHUNK_MS = 14;
const seconds = (ms: number) => (ms < 1000 ? "under a second" : `${Math.round(ms / 100) / 10}s`);

/** Tells the navigation rail to fold away or come back. */
const rail = (to: "collapse" | "expand") => window.dispatchEvent(new CustomEvent("uztrade:rail", { detail: to }));

/**
 * The dashboard as a conversation.
 *
 *   first visit   one question, centred: what are you moving?
 *   talking       the thread in the middle, the composer at the bottom, the
 *                 agents in a column on the right; the navigation folds away
 *   a case        the orchestrator puts each step into the thread as a card;
 *                 finished steps fold to one line
 *
 * Every reply carries the avatar of the agent that wrote it. Workflow
 * progress only ever comes from the orchestrator's view - text in the chat
 * answers questions, it never completes a step.
 */
export default function Conversation() {
  const router = useRouter();
  const params = useSearchParams();
  const param = params.get("case");
  const caseId = param && /^UZ-\d{4}-\d{4}$/i.test(param) ? param.toUpperCase() : null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState("");
  const [thinking, setThinking] = useState<AgentId | null>(null);
  const [turn, setTurn] = useState<IntakeTurn | null>(null);
  const [intakeRestored, setIntakeRestored] = useState(false);

  const [loaded, setLoaded] = useState<{ id: string; view: AssistantView | null; error: string | null } | null>(null);
  const view = loaded?.id === caseId ? loaded.view : null;
  const loadError = loaded?.id === caseId ? loaded.error : null;
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [risk, setRisk] = useState<{ id: string; report: RiskReport } | null>(null);
  const [transit, setTransit] = useState<{ id: string; view: TransitView } | null>(null);

  const input = useRef<HTMLTextAreaElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const seq = useRef(0);
  const nextId = () => `m${(seq.current += 1)}`;
  /** The case this thread belongs to; another case starts a fresh thread. */
  const threadCase = useRef<string | null>(null);
  const openingCase = useRef(false);
  /** Risk said something about this case already. */
  const riskSpoke = useRef<string | null>(null);

  const started = messages.length > 0 || Boolean(caseId);
  const pending = thinking !== null || busy !== null;

  /* ------------------------------------------------------ which thread --- */

  useEffect(() => {
    if (intakeRestored) return;
    try {
      if (!caseId && param !== "new") {
        const activeCase = window.sessionStorage.getItem("uztrade.session.case.v1");
        if (activeCase && /^UZ-\d{4}-\d{4}$/i.test(activeCase)) {
          router.replace(`/dashboard?case=${encodeURIComponent(activeCase)}`);
          setIntakeRestored(true);
          return;
        }
        const restored = restoreIntake(window.sessionStorage);
        if (restored) {
          const result: ChatResult = { kind: "intake", turn: restored };
          const spoken = brief(result);
          setTurn(restored);
          setMessages([{ id: "restored-intake", who: "assistant", text: spoken.text, result, options: spoken.actions.options, confirm: spoken.actions.confirm }]);
        }
      }
    } catch { /* Browser storage may be disabled. */ }
    setIntakeRestored(true);
  }, [intakeRestored, caseId, param, router]);

  useEffect(() => {
    if (!intakeRestored || caseId || param === "new") return;
    try { saveIntake(window.sessionStorage, turn); } catch { /* Storage is optional. */ }
  }, [turn, intakeRestored, caseId, param]);

  useEffect(() => {
    if (param === "new") {
      try {
        saveIntake(window.sessionStorage, null);
        window.sessionStorage.removeItem("uztrade.session.case.v1");
      } catch { /* Storage is optional. */ }
      setMessages([]);
      setTurn(null);
      threadCase.current = null;
      router.replace("/dashboard");
      input.current?.focus();
      return;
    }
    if (!caseId && threadCase.current) {
      router.replace(`/dashboard?case=${encodeURIComponent(threadCase.current)}`);
      return;
    }
    // A case opened from this very thread set threadCase first, so it keeps
    // its conversation; any other case, or none, starts a fresh one.
    if (caseId !== threadCase.current) {
      setMessages([]);
      threadCase.current = caseId;
      setTurn(null);
      setProblem(null);
    }
  }, [param, caseId, router]);

  // The navigation gets out of the way once there is a conversation.
  useEffect(() => {
    rail(started ? "collapse" : "expand");
  }, [started]);

  /* ---------------------------------------------------------- the case --- */

  useEffect(() => {
    if (!caseId) return;
    try { window.sessionStorage.setItem("uztrade.session.case.v1", caseId); } catch { /* Storage is optional. */ }
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

  // The risk and transit agents read the case's records after every change.
  useEffect(() => {
    if (!caseId || !version) return;
    let live = true;
    fetch(`/api/cases/${caseId}/risk`)
      .then((r) => readJson<RiskReport>(r, "Risk is unavailable"))
      .then((report) => live && setRisk({ id: caseId, report }))
      .catch(() => undefined);
    fetch(`/api/cases/${caseId}/transit`)
      .then((r) => readJson<TransitView>(r, "Transit is unavailable"))
      .then((t) => live && setTransit({ id: caseId, view: t }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [caseId, version]);

  /* The orchestrator speaks when the case's step changes: once to introduce
     the case, then a card for each step it moves to. */
  useEffect(() => {
    if (!view || view.caseId !== caseId) return;
    setMessages((all) => {
      const out = [...all];
      if (!out.some((m) => m.who === "orchestrator" && m.id.startsWith("intro"))) {
        const k = view.kpis;
        out.push({
          id: `intro-${view.caseId}`,
          who: "orchestrator",
          text: k.completed === 0 ? "The case is open. I'll bring you each step as it comes up." : "Picking up where the case left off.",
          card: { kind: "case" },
        });
      }
      const lastStep = [...out].reverse().find((m) => m.step);
      if (view.next && lastStep?.step?.num !== view.next.stepNum) {
        out.push({ id: nextId(), who: "orchestrator", text: "", step: { num: view.next.stepNum, title: view.next.title } });
      } else if (!view.next && view.status === "completed" && !out.some((m) => m.id === `done-${view.caseId}`)) {
        out.push({ id: `done-${view.caseId}`, who: "orchestrator", text: `Every step of ${view.caseId} is done.` });
      }
      return out.length === all.length ? all : out;
    });
  }, [view, caseId]);

  // Risk speaks up once per case, and only when there is something to check.
  useEffect(() => {
    if (!risk || risk.id !== caseId || riskSpoke.current === caseId) return;
    const r = risk.report;
    if (r.overall.status !== "high" && r.overall.status !== "caution") return;
    riskSpoke.current = caseId;
    setMessages((all) => [...all, { id: nextId(), who: "risk", text: riskSummary(r), card: { kind: "risk", report: r } }]);
  }, [risk, caseId]);

  /* -------------------------------------------------------- the thread --- */

  useEffect(() => {
    const el = thread.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [messages, view]);

  const onThreadScroll = () => {
    const el = thread.current;
    if (el) following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const patch = (id: string, change: (m: Message) => Message) => setMessages((all) => all.map((m) => (m.id === id ? change(m) : m)));
  const add = (m: Omit<Message, "id">) => {
    const id = nextId();
    setMessages((all) => [...all, { ...m, id }]);
    return id;
  };
  const write = (id: string, chunk: string) =>
    new Promise<void>((resolve) => {
      patch(id, (m) => ({ ...m, text: m.text + chunk }));
      setTimeout(resolve, CHUNK_MS);
    });
  const finish = (m: Message): Message => ({ ...m, streaming: false, took: m.began ? Date.now() - m.began : undefined });

  /** Before a case: the trade assistant, streamed, one question at a time. */
  const askAssistant = async (message: string) => {
    const id = add({ who: "assistant", text: "", streaming: true, steps: [], began: Date.now() });
    const active = turn && turn.status !== "declined" ? turn : null;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, draft: active?.draft ?? null, expecting: active?.slot ?? null, caseId, presentation: "cards" }),
      });
      if (!response.ok || !response.body) throw new Error((await response.json().catch(() => null))?.error ?? "The assistant did not answer");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answeredByIntake = false;
      const handle = async (event: ChatEvent) => {
        if (event.type === "stage")
          patch(id, (m) => {
            const steps = m.steps ?? [];
            const at = steps.findIndex((x) => x.id === event.stage.id && x.state === "running");
            return { ...m, steps: at >= 0 ? steps.map((x, i) => (i === at ? event.stage : x)) : [...steps, event.stage] };
          });
        else if (event.type === "text") await write(id, event.chunk);
        else if (event.type === "actions")
          patch(id, (m) => ({ ...m, options: event.actions.options?.length ? event.actions.options : undefined, confirm: event.actions.confirm }));
        else if (event.type === "result") {
          const { result, followUps } = event;
          patch(id, (m) => ({ ...m, result, followUps }));
          if (result.kind === "intake") {
            answeredByIntake = true;
            setTurn(result.turn);
          }
        }
        else if (event.type === "error") patch(id, (m) => ({ ...m, error: event.message }));
      };
      for (;;) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let at: number;
        while ((at = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, at).trim();
          buffer = buffer.slice(at + 1);
          if (line) await handle(JSON.parse(line) as ChatEvent);
        }
        if (done) break;
      }
      if (buffer.trim()) await handle(JSON.parse(buffer) as ChatEvent);
      // A side question answered mid-intake: pick the shipment back up, so
      // the thread never loses the question that is still open.
      if (!answeredByIntake && active?.status === "asking") {
        const goods = active.draft.commodity?.term ?? active.draft.proposal?.term ?? active.draft.pendingTerm;
        await write(id, `\n\nBack to your ${goods ? `${goods} ` : ""}shipment: ${active.message}`);
      }
      patch(id, finish);
    } catch (error) {
      patch(id, (m) => finish({ ...m, error: error instanceof Error ? error.message : "Network error" }));
      throw error;
    }
  };

  /** With a case open: the orchestrator answers from the case and its procedure. */
  const askOrchestrator = async (question: string) => {
    const id = add({ who: "orchestrator", text: "", streaming: true, began: Date.now(), steps: [{ id: "case", label: `Reading case ${caseId}`, state: "running" }] });
    try {
      const body = await readJson<{ answer: ProcedureQaAnswer }>(
        await fetch(`/api/cases/${caseId}/assistant`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ask", question }) }),
        "Could not answer that",
      );
      patch(id, (m) => ({ ...m, steps: [{ id: "case", label: `Read case ${caseId} and its procedure`, state: "done" }] }));
      const text = [body.answer.message, ...(body.answer.bullets ?? []).map((b) => `• ${b}`)].join("\n");
      for (const word of text.split(/(\s+)/)) await write(id, word);
      patch(id, finish);
    } catch (error) {
      patch(id, (m) => finish({ ...m, error: error instanceof Error ? error.message : "Could not answer that" }));
    }
  };

  /** The matched shipment becomes a case, and the thread carries on in it. */
  const openCase = async () => {
    if (!turn || turn.status !== "confirm" || busy || caseId || threadCase.current || openingCase.current) return;
    openingCase.current = true;
    setBusy("open");
    try {
      const opened = await readJson<{ status: string; caseId?: string; message?: string }>(
        await fetch("/api/intake", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft: turn.draft, confirm: true, caseId: threadCase.current }) }),
        "Could not open the case",
      );
      if (opened.status !== "opened" || !opened.caseId) throw new Error(opened.message || "A detail no longer holds. Tell me the shipment again.");
      try { saveIntake(window.sessionStorage, null); } catch { /* Storage is optional. */ }
      setTurn(null);
      setMessages((all) => all.map((m) => ({ ...m, confirm: undefined, options: undefined, followUps: undefined })));
      threadCase.current = opened.caseId;
      try { window.sessionStorage.setItem("uztrade.session.case.v1", opened.caseId); } catch { /* Storage is optional. */ }
      rememberCase(opened.caseId);
      router.replace(`/dashboard?case=${encodeURIComponent(opened.caseId)}`);
    } catch (error) {
      add({ who: "assistant", text: "", error: error instanceof Error ? error.message : "Could not open the case" });
    }
    openingCase.current = false;
    setBusy(null);
  };

  const send = async (text?: string) => {
    const message = (text ?? query).trim();
    if (!message || pending || openingCase.current) return;
    setQuery("");
    following.current = true;
    const last = messages.at(-1);
    add({ who: "user", text: message });
    setMessages((all) => all.map((m) => (m.options || m.followUps ? { ...m, options: undefined, followUps: undefined } : m)));

    if (!caseId && last?.confirm && turn?.status === "confirm" && confirmsShipment(message)) {
      await openCase();
      return;
    }
    const agent: AgentId = caseId ? "orchestrator" : "assistant";
    setThinking(agent);
    try {
      if (caseId) await askOrchestrator(message);
      else await askAssistant(message);
    } catch {
      setQuery(message); // a failed request must not eat what was typed
    }
    setThinking(null);
  };

  /* ------------------------------------------------- acting on the step --- */

  const act: Act = async (key, payload) => {
    if (!caseId) return;
    const action = String(payload.action);
    setBusy(action === "complete" || action === "sync" ? action : key);
    setProblem(null);
    try {
      const response = await fetch(`/api/cases/${caseId}/assistant`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = (await response.json().catch(() => ({}))) as AssistantView & { error?: string; missing?: string[] };
      if (response.status === 422) setProblem(`Not ready yet. Still needed: ${(body.missing ?? []).join(", ") || body.error}`);
      else if (!response.ok) setProblem(body.error || "That did not go through");
      else {
        setLoaded({ id: caseId, view: body, error: null });
        setVersion((v) => v + 1);
      }
    } catch {
      setProblem("That did not go through. Check your connection and try again.");
    }
    setBusy(null);
  };

  const upload: Upload = async (need, stepNum, file) => {
    if (!caseId) return;
    setBusy(`upload:${need.id}`);
    setProblem(null);
    add({ who: "user", text: `Sent ${file.name} for ${need.label.toLowerCase()}` });
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("stepNum", String(stepNum));
      form.append("label", need.label);
      const body = await readJson<{ document: Parameters<typeof briefDocumentUpload>[0]; view: AssistantView }>(
        await fetch(`/api/cases/${caseId}/documents`, { method: "POST", body: form }),
        "The upload failed",
      );
      // Document Intelligence closed the step itself when everything checked out.
      const closed = body.view.recent.some((f) => f.text.startsWith(`Completed step ${stepNum} `) && f.text.includes("read and verified"));
      add({
        who: "documents",
        text: closed ? `Everything on ${need.label.toLowerCase()} checks out, so step ${stepNum} is done.` : briefDocumentUpload(body.document).join("\n\n"),
        steps: [
          { id: "read", label: `Read ${file.name}`, state: "done" },
          { id: "check", label: "Checked it against the shipment", state: "done" },
          ...(closed ? [{ id: "close", label: `Completed step ${stepNum}: every required field read and verified`, state: "done" as const }] : []),
        ],
      });
      setLoaded({ id: caseId, view: body.view, error: null });
      setVersion((v) => v + 1);
    } catch (e) {
      add({ who: "documents", text: "", error: e instanceof Error ? e.message : "The upload failed" });
    }
    setBusy(null);
  };

  const statuses = useMemo(
    () =>
      agentStatuses({
        thinking,
        turn,
        caseId,
        view,
        busy,
        risk: risk?.id === caseId ? risk.report : null,
        transit: transit?.id === caseId ? transit.view : null,
      }),
    [thinking, turn, caseId, view, busy, risk, transit],
  );

  /** "Show me what it needs": the step card, or the question being asked. */
  const focusOn = useCallback((id: AgentId) => {
    if (id === "assistant") return input.current?.focus();
    // The step card holds what the workflow and document agents wait for;
    // the others' last word in the thread says what they found.
    const said = [...(thread.current?.querySelectorAll(`.msg[data-who="${id}"]`) ?? [])].at(-1);
    const step = document.getElementById("current-step");
    const target = id === "orchestrator" || id === "documents" ? (step ?? said) : (said ?? step);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  /* ------------------------------------------------------------ render --- */

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
          placeholder={
            caseId ? "Ask about this case or a step…" : turn?.status === "asking" ? "Your answer…" : started ? "Reply, or ask anything…" : "What are you moving, and where to?"
          }
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div className="composer-row">
          <p className="composer-note">{thinking ? `${AGENTS[thinking].name} is working…` : "Enter to send · Shift+Enter for a new line"}</p>
          <button type="submit" className="send" aria-label="Send" title="Send" disabled={pending || !query.trim()}>
            {Icon.send}
          </button>
        </div>
      </div>
    </form>
  );

  if (!started) {
    return (
      <section className="convo convo-start" aria-label="Trade assistant">
        <div className="start-inner">
          <Avatar who="assistant" />
          <h1 className="start-title">What are you moving?</h1>
          <p className="start-lede">
            Say it the way you would to a forwarder. I&rsquo;ll ask for anything missing.
          </p>
          {composer}
          <StarterCards starters={STARTERS} onPick={(text) => void send(text)} />
        </div>
      </section>
    );
  }

  const lastStepId = [...messages].reverse().find((m) => m.step)?.id;
  const lastId = messages.at(-1)?.id;

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
          Worked through {plural(finished.length, "step")}
          {m.took && !m.streaming ? ` in ${seconds(m.took)}` : ""}
        </summary>
        <ol>
          {finished.map((s, i) => (
            <li key={`${s.id}-${i}`} data-state={s.state}>
              {s.label}
              {s.detail ? <span> ({s.detail})</span> : null}
            </li>
          ))}
        </ol>
      </details>
    );
  };

  /** Taps under the latest reply: the answers to its question, or what to ask next. */
  const chips = (m: Message) => {
    if (m.id !== lastId || m.streaming) return null;
    const taps = m.options?.length ? m.options : (m.followUps ?? []);
    if (!taps.length) return null;
    return (
      <p className="msg-options">
        {taps.slice(0, 8).map((o) => (
          <button key={o.text} type="button" className="chip" disabled={pending} onClick={() => void send(o.text)}>
            {o.label}
          </button>
        ))}
      </p>
    );
  };

  /** Starts the correction of a filled detail in the composer. */
  const correct = (slot: string) => {
    setQuery(CORRECT[slot] ?? "Actually, ");
    requestAnimationFrame(() => {
      const el = input.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  /** What the reply found, drawn instead of said. */
  const card = (m: Message) => {
    if (m.card?.kind === "case") return view ? <CaseCard view={view} /> : null;
    if (m.card?.kind === "risk") return <RiskCard report={m.card.report} />;
    const r = m.result;
    if (!r) return null;
    const pick = (text: string) => void send(text);
    switch (r.kind) {
      case "intake": {
        // Only the latest shipment reply can still be acted on.
        const live = m.id === lastId && !caseId;
        if (r.turn.status === "confirm" && r.turn.summary)
          return caseId ? (
            <p className="msg-folded">
              <span className="msg-folded-mark">{Icon.check}</span>
              Opened as case {caseId}
            </p>
          ) : <PlanCard turn={r.turn} needs={r.needs} opening={busy === "open"} disabled={pending || !live} onOpen={() => void openCase()} />;
        return (
          <>
            {r.overview?.options.length ? (
              <WaysCard goods={r.overview.goods} options={r.overview.options} needs={r.overview.needs} disabled={pending || !live} onPick={pick} />
            ) : null}
            {r.turn.status === "asking" ? <ShipmentProgress turn={r.turn} disabled={pending || !live} onEdit={correct} /> : null}
          </>
        );
      }
      case "estimate":
        return (
          <WaysCard
            goods={r.estimate.goods}
            options={r.estimate.options}
            from={r.estimate.from}
            to={r.estimate.to}
            assumed={r.estimate.assumed}
            disabled={pending}
            onPick={pick}
          />
        );
      case "cases":
        return <CasesCard cases={r.answer.cases} />;
      case "knowledge":
        return <SourcesCard sources={r.answer.sources} />;
      default:
        return null;
    }
  };

  const body = (m: Message) => {
    if (m.step) {
      if (m.id === lastStepId && view && view.next?.stepNum === m.step.num)
        return (
          <div id="current-step" className="msg-card">
            <StepBlock view={view} busy={busy} problem={problem} onAct={act} onUpload={upload} onAsk={(q) => void send(q)} />
          </div>
        );
      return (
        <p className="msg-folded">
          <span className="msg-folded-mark">{Icon.check}</span>
          Step {m.step.num}, {m.step.title}
        </p>
      );
    }
    return (
      <>
        {reasoning(m)}
        {m.text ? (
          <div className="msg-text">
            {m.text.split("\n").map((line, i) =>
              line.trim() ? (
                <p key={i} className={line.startsWith("•") ? "msg-item" : undefined}>
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
        {m.error ? <p className="reply-error">{m.error}</p> : null}
        {m.streaming ? null : card(m)}
        {chips(m)}
      </>
    );
  };

  return (
    <section className="convo" aria-label="Trade assistant">
      <div className="convo-main">
        <header className="convo-head">
          <div>
            <h1>{view ? view.title : caseId ? caseId : "New shipment"}</h1>
            <p>{caseId ? `Case ${caseId}${view ? ` · ${view.kpis.completed} of ${view.kpis.total} steps done` : ""}` : "Nothing is opened until you say so."}</p>
          </div>
          <nav className="convo-links" aria-label="Case">
            {caseId ? <Link href={`/cases/${caseId}`}>Whole workflow</Link> : null}
            {caseId ? <Link href={`/ledger?case=${caseId}`}>Ledger</Link> : null}
            <Link href="/dashboard?case=new" className="convo-new">
              {Icon.plus} <span>New shipment</span>
            </Link>
          </nav>
        </header>

        <div className="convo-thread" ref={thread} onScroll={onThreadScroll} role="log" aria-label="Conversation">
          <div className="convo-column">
            {messages.map((m) => (
              <article key={m.id} className="msg" data-who={m.who}>
                <Avatar who={m.who} />
                <div className="msg-body">
                  <p className="msg-name">{m.who === "user" ? "You" : AGENTS[m.who].name}</p>
                  {body(m)}
                </div>
              </article>
            ))}
            {caseId && !view ? <p className="convo-loading">{loadError ?? "Loading the case…"}</p> : null}
          </div>
        </div>

        <div className="convo-dock">
          {composer}
          <p className="composer-foot">Figures come from the published procedures. Check anything you file with the entity itself.</p>
        </div>
      </div>

      <aside className="convo-agents" aria-label="Agents on this shipment">
        <AgentRail statuses={statuses} onFocus={focusOn} />
      </aside>
    </section>
  );
}
