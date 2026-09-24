import { useCallback, useEffect, useRef, useState } from "react";
import {
  useChat,
  type ChatMessage,
  type ChatSessionMeta,
} from "@intheloop-studio/hermes-remote-react";
import { AuthGate } from "./components/AuthGate.tsx";
import { Composer } from "./components/Composer.tsx";
import { Message } from "./components/Message.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Star } from "./components/Star.tsx";
import { DEMO, client, supabase } from "./config.ts";
import { localSessionIds, rememberSession } from "./lib/local-sessions.ts";

type Auth = { state: "loading" } | { state: "signedOut" } | { state: "signedIn"; who: string };

function useAuth(): Auth {
  const [auth, setAuth] = useState<Auth>(
    supabase === null
      ? { state: "signedIn", who: DEMO ? "Demo guest" : "Guest" }
      : { state: "loading" },
  );
  useEffect(() => {
    if (supabase === null) {
      return;
    }
    const apply = (session: { user: { id: string; email?: string | undefined } } | null) =>
      setAuth(
        session === null
          ? { state: "signedOut" }
          : {
              state: "signedIn",
              who: session.user.email || `Guest ${session.user.id.slice(0, 6)}`,
            },
      );
    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session));
    return () => data.subscription.unsubscribe();
  }, []);
  return auth;
}

export function App() {
  const auth = useAuth();
  if (auth.state === "loading") {
    return (
      <main className="gate" aria-busy="true">
        <p className="muted">
          <Star /> Checking your sign-in
        </p>
      </main>
    );
  }
  if (auth.state === "signedOut" && supabase !== null) {
    return <AuthGate supabase={supabase} />;
  }
  return <Chat who={auth.state === "signedIn" ? auth.who : "Guest"} />;
}

function Chat({ who }: { who: string }) {
  const chat = useChat({ client });
  // Every chat (for titles) and what the list shows (search results when searching).
  const [allSessions, setAllSessions] = useState<ChatSessionMeta[]>([]);
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const thread = useRef<HTMLDivElement>(null);
  // Signed-in users own their sessions; guests list the ones this browser made.
  const byOwner = supabase !== null || DEMO;

  const refresh = useCallback(async () => {
    try {
      const all = await client.listSessions(byOwner ? undefined : localSessionIds());
      setAllSessions(all);
      setSessions(query !== "" ? await client.searchSessions(query) : all);
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
    }
  }, [query, byOwner]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight });
  }, [chat.messages]);

  useEffect(() => {
    if (chat.sessionId !== null && !byOwner) {
      rememberSession(chat.sessionId);
    }
  }, [chat.sessionId, byOwner]);

  const act = async (action: () => Promise<unknown>) => {
    try {
      setProblem(null);
      await action();
      await refresh();
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const lastUserId = [...chat.messages].reverse().find((m) => m.role === "user")?.id;
  const title = allSessions.find((s) => s.id === chat.sessionId)?.title ?? "New chat";

  return (
    <div className={`app ${drawer ? "drawer-open" : ""}`}>
      {DEMO && (
        <p className="demo-banner" role="note">
          Demo mode: this chat runs on built-in sample data in your browser, not a live agent. Set{" "}
          <code>VITE_HERMES_API_URL</code> to connect a real server.
        </p>
      )}
      <header className="topbar">
        <button
          type="button"
          className="icon-button menu"
          aria-label={drawer ? "Close chats" : "Open chats"}
          aria-expanded={drawer}
          onClick={() => setDrawer((open) => !open)}
        >
          ☰
        </button>
        <span className="brand">
          <Star /> hermes remote
        </span>
        <h1 className="chat-title">{title}</h1>
      </header>
      <div className="layout">
        <Sidebar
          sessions={sessions}
          activeId={chat.sessionId}
          who={who}
          canSearch={byOwner}
          onNew={() => {
            chat.reset();
            setEditing(null);
            setDrawer(false);
          }}
          onOpen={(id) => {
            setEditing(null);
            setDrawer(false);
            void act(() => chat.open(id));
          }}
          onRename={(id, name) => void act(() => client.renameSession(id, name))}
          onArchive={(id) =>
            void act(async () => {
              await client.archiveSession(id);
              if (id === chat.sessionId) {
                chat.reset();
              }
            })
          }
          onDelete={(id) => {
            if (!window.confirm("Delete this chat? This can't be undone.")) {
              return;
            }
            void act(async () => {
              await client.deleteSession(id);
              if (id === chat.sessionId) {
                chat.reset();
              }
            });
          }}
          onSearch={setQuery}
          onSignOut={supabase === null ? null : () => void supabase?.auth.signOut()}
        />
        <main className="conversation">
          <div
            ref={thread}
            className="thread"
            role="log"
            aria-live="polite"
            aria-label="Conversation"
          >
            {chat.messages.length === 0 ? (
              <div className="empty">
                <p className="display">What should the agent do?</p>
                <p className="muted">
                  Ask a question, attach an image, or pick up an earlier chat from the list.
                </p>
              </div>
            ) : (
              chat.messages.map((m, i) => (
                <Message
                  key={m.id}
                  message={m}
                  streaming={chat.streaming && i === chat.messages.length - 1}
                  onReact={(emoji) => void act(() => chat.react(m.id, emoji))}
                  onEdit={m.id === lastUserId && !chat.streaming ? () => setEditing(m) : null}
                />
              ))
            )}
          </div>
          {(problem ?? chat.error) !== null && (
            <p className="error banner" role="alert">
              {problem ?? chat.error}
            </p>
          )}
          <Composer
            streaming={chat.streaming}
            editing={editing}
            onSend={(content, attachments) => {
              const target = editing;
              setEditing(null);
              void act(() =>
                target !== null ? chat.edit(target.id, content) : chat.send(content, attachments),
              );
            }}
            onStop={() => void chat.stop()}
            onCancelEdit={() => setEditing(null)}
          />
        </main>
      </div>
    </div>
  );
}
