/* Recent chats, kept in the visitor's own browser.
 *
 * There is no sign-in, so a chat stored on the server would be everyone's
 * chat: the next demo visitor would open the sidebar and read the last one's
 * conversation. localStorage keeps each visitor's sessions to themselves with
 * no account, no cookie and no table - at the cost of not following them to
 * another device, which is the right trade for a demo.
 *
 * Only what is needed to show a conversation again is stored: the messages as
 * text, the case a session opened, and when it was last touched. Nothing here
 * is trusted as state - the case itself lives in Postgres, and reopening a
 * session re-reads it.
 */

import type { IntakeTurn } from "../intake/conversation";

export type StoredMessage = { role: "user" | "assistant"; text: string; at: number };

export type ChatSession = {
  id: string;
  /** Taken from the first thing the trader said. */
  title: string;
  messages: StoredMessage[];
  /** The case this conversation opened, when it opened one. */
  caseId: string | null;
  /** The unfinished shipment, restored on refresh in this browser. */
  turn?: IntakeTurn | null;
  createdAt: number;
  updatedAt: number;
};

const KEY = "uztrade.chats.v1";
const ACTIVE_KEY = "uztrade.active-chat.v1";
/** Enough to look like history without filling the quota. */
const MAX_SESSIONS = 30;
const MAX_MESSAGES = 60;

const browser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

function read(): ChatSession[] {
  if (!browser()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSession).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    // Private windows, cleared site data, a quota error mid-write: history is
    // a convenience, so losing it must never break the chat.
    return [];
  }
}

function write(sessions: ChatSession[]): void {
  if (!browser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch {
    /* over quota or blocked - the conversation on screen is unaffected */
  }
}

function isSession(value: unknown): value is ChatSession {
  const s = value as ChatSession;
  return Boolean(s && typeof s.id === "string" && typeof s.title === "string" && Array.isArray(s.messages) && typeof s.updatedAt === "number");
}

export const listSessions = (): ChatSession[] => read();

export const getSession = (id: string): ChatSession | null => read().find((s) => s.id === id) ?? null;

export function activeSessionId(): string | null {
  if (!browser()) return null;
  try { return window.localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}

export function setActiveSessionId(id: string): void {
  if (!browser()) return;
  try { window.localStorage.setItem(ACTIVE_KEY, id); } catch { /* storage is optional */ }
}

export function newSessionId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** A title from the trader's first message: enough to recognise it later. */
export function titleFor(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  if (clean.length <= 48) return clean || "New chat";
  return `${clean.slice(0, 47).replace(/[\s,;:.-]+$/, "")}…`;
}

/** Writes one session, moving it to the top of the list. */
export function saveSession(session: Omit<ChatSession, "createdAt" | "updatedAt"> & Partial<Pick<ChatSession, "createdAt">>): ChatSession {
  const now = Date.now();
  const existing = getSession(session.id);
  const saved: ChatSession = {
    ...session,
    messages: session.messages.slice(-MAX_MESSAGES),
    createdAt: session.createdAt ?? existing?.createdAt ?? now,
    updatedAt: now,
  };
  write([saved, ...read().filter((s) => s.id !== saved.id)]);
  return saved;
}

export function deleteSession(id: string): void {
  write(read().filter((s) => s.id !== id));
  if (activeSessionId() === id && browser()) {
    try { window.localStorage.removeItem(ACTIVE_KEY); } catch { /* storage is optional */ }
  }
}

export function clearSessions(): void {
  if (!browser()) return;
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* nothing to do */
  }
}

/** "just now", "12m", "3h", "yesterday", "12 Sep" - the sidebar has no room for more. */
export function whenLabel(at: number, now = Date.now()): string {
  const minutes = Math.round((now - at) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  if (hours < 48) return "yesterday";
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
