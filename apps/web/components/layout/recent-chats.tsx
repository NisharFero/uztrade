"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "../icons";
import { deleteSession, listSessions, whenLabel, type ChatSession } from "../../modules/chat/sessions";

/* The sidebar's history, the way a chat app has one: the newest conversations,
 * a click to reopen one, and a new chat button. Sessions live in this browser
 * (modules/chat/sessions.ts explains why), so this only renders after mount -
 * the server has nothing to render and would otherwise disagree with it. */
export default function RecentChats() {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("chat");
  const [sessions, setSessions] = useState<ChatSession[] | null>(null);

  useEffect(() => {
    const load = () => setSessions(listSessions());
    load();
    // The chat writes to the same store; both tabs and the page itself say so.
    window.addEventListener("storage", load);
    window.addEventListener("uztrade:chats", load);
    return () => {
      window.removeEventListener("storage", load);
      window.removeEventListener("uztrade:chats", load);
    };
  }, []);

  const open = (id: string) => router.push(`/?chat=${encodeURIComponent(id)}`);

  const remove = (event: React.MouseEvent, id: string) => {
    event.stopPropagation();
    deleteSession(id);
    setSessions(listSessions());
    if (current === id) router.push("/");
  };

  return (
    <div className="recents">
      <button type="button" className="recents-new" onClick={() => router.push("/?chat=new")}>
        <span className="nav-icon">{Icon.compose}</span>
        <span>New chat</span>
      </button>

      {sessions === null ? null : sessions.length === 0 ? (
        <p className="recents-empty">Your chats show up here.</p>
      ) : (
        <>
          <p className="recents-head">Recent</p>
          <ul className="recents-list">
            {sessions.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  className={session.id === current ? "recents-item is-current" : "recents-item"}
                  onClick={() => open(session.id)}
                  title={session.title}
                >
                  <span className="recents-title">{session.title}</span>
                  <span className="recents-when">{whenLabel(session.updatedAt)}</span>
                </button>
                <button type="button" className="recents-remove" aria-label={`Delete ${session.title}`} onClick={(e) => remove(e, session.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
