import { useEffect, useState } from "react";
import { useChat, useSessions } from "@intheloop-studio/hermes-remote-react";
import type { ChatMessage } from "@intheloop-studio/hermes-remote-client";
import { client } from "./lib/client.ts";
import { ErrorNote, Panel, Shell } from "./lib/ui.tsx";

const IDS_KEY = "hermes-example-chat-sessions";

function storedIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(IDS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function rememberId(id: string): void {
  const ids = storedIds();
  if (!ids.includes(id)) {
    localStorage.setItem(IDS_KEY, JSON.stringify([id, ...ids].slice(0, 20)));
  }
}

function Message(props: {
  message: ChatMessage;
  onReact: (id: string, emoji: string) => void;
  onEdit: (id: string, content: string) => void;
}) {
  const { message } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const mine = message.role === "user";
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          "max-w-[85%] rounded-xl px-3 py-2 text-sm " +
          (mine ? "bg-zinc-100 text-zinc-900" : "card text-zinc-100")
        }
      >
        {editing ? (
          <span className="flex gap-2">
            <input
              className="input min-w-48"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              className="btn"
              onClick={() => {
                setEditing(false);
                props.onEdit(message.id, draft);
              }}
            >
              save
            </button>
          </span>
        ) : (
          <span className="whitespace-pre-wrap">
            {message.content}
            {message.status === "streaming" ? "▍" : ""}
          </span>
        )}
        <span className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
          {Object.entries(message.reactions).map(([emoji, count]) => (
            <span key={emoji}>
              {emoji} {count}
            </span>
          ))}
          <button
            className="hover:text-zinc-300"
            onClick={() => props.onReact(message.id, "🔥")}
          >
            🔥
          </button>
          {mine && message.status === "done" ? (
            <button
              className="hover:text-zinc-300"
              onClick={() => setEditing(true)}
            >
              edit
            </button>
          ) : null}
        </span>
      </div>
    </div>
  );
}

export default function App() {
  const [ids, setIds] = useState<string[]>(storedIds());
  const chat = useChat({ client });
  const sessions = useSessions({ client, ids });
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (chat.sessionId !== null) {
      rememberId(chat.sessionId);
      setIds(storedIds());
    }
  }, [chat.sessionId]);

  const send = async () => {
    const content = draft.trim();
    if (content === "" || chat.streaming) {
      return;
    }
    setDraft("");
    await chat.send(content);
    await sessions.refresh();
  };

  return (
    <Shell
      title="chat"
      slug="chat"
      blurb="Streaming conversations through useChat: edit, react, regenerate, stop."
    >
      <div className="grid flex-1 gap-4 md:grid-cols-[220px_1fr]">
        <Panel
          title="sessions"
          actions={
            <button className="btn btn-ghost" onClick={() => chat.reset()}>
              new
            </button>
          }
        >
          <ul className="flex flex-col gap-1 text-sm">
            {sessions.sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-1">
                <button
                  className={
                    "truncate text-left hover:text-white " +
                    (s.id === chat.sessionId ? "text-white" : "text-zinc-400")
                  }
                  onClick={() => void chat.open(s.id)}
                >
                  {s.title ?? s.id.slice(0, 8)}
                </button>
                <button
                  className="text-zinc-600 hover:text-red-400"
                  onClick={() => void sessions.remove(s.id)}
                >
                  ×
                </button>
              </li>
            ))}
            {sessions.sessions.length === 0 ? (
              <li className="text-zinc-600">no sessions yet</li>
            ) : null}
          </ul>
        </Panel>
        <Panel
          title="conversation"
          actions={
            chat.streaming ? (
              <button className="btn" onClick={() => void chat.stop()}>
                stop
              </button>
            ) : undefined
          }
        >
          <div className="flex min-h-[50vh] flex-1 flex-col gap-2 overflow-y-auto">
            {chat.messages.map((m) => (
              <Message
                key={m.id}
                message={m}
                onReact={(id, emoji) => void chat.react(id, emoji)}
                onEdit={(id, content) => void chat.edit(id, content)}
              />
            ))}
            {chat.messages.length === 0 ? (
              <p className="m-auto text-sm text-zinc-600">
                say hello and the reply streams token by token
              </p>
            ) : null}
          </div>
          <ErrorNote error={chat.error} />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              className="input"
              placeholder="message your agent…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="btn btn-primary" disabled={chat.streaming}>
              send
            </button>
          </form>
        </Panel>
      </div>
    </Shell>
  );
}
