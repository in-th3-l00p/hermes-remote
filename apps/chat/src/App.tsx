import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { createClient } from "@supabase/supabase-js";
import { HermesClient, useChat } from "@in-th3-l00p/hermes-web-react";
import type {
  Attachment,
  ChatMessage,
  ChatSessionMeta,
} from "@in-th3-l00p/hermes-web-react";

const API_URL =
  (import.meta.env["VITE_HERMES_API_URL"] as string | undefined) ??
  "http://localhost:8643";
const SUPABASE_URL = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env["VITE_SUPABASE_ANON_KEY"] as
  | string
  | undefined;

const supabase =
  SUPABASE_URL !== undefined && SUPABASE_ANON_KEY !== undefined
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const LOCAL_SESSIONS_KEY = "hermes-chat-sessions";
const REACTION_CHOICES = ["👍", "❤️", "😂", "🔥", "🤔"];

function localSessionIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SESSIONS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function rememberLocalSession(id: string): void {
  const ids = localSessionIds();
  if (!ids.includes(id)) {
    localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify([id, ...ids]));
  }
}

function readFileAsDataUrl(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({ name: file.name, type: file.type, dataUrl: String(reader.result) });
    reader.onerror = () => reject(new Error("could not read file"));
    reader.readAsDataURL(file);
  });
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Bubble({
  message,
  streaming,
  onReact,
  onEdit,
}: {
  message: ChatMessage;
  streaming: boolean;
  onReact: (emoji: string) => void;
  onEdit: (() => void) | null;
}) {
  const mine = message.role === "user";
  const reactions = Object.keys(message.reactions);
  return (
    <div className={`row ${mine ? "mine" : "theirs"}`}>
      <div className="bubble">
        {message.attachments.length > 0 && (
          <div className="attachments">
            {message.attachments.map((a) => (
              <img key={a.name} src={a.dataUrl} alt={a.name} />
            ))}
          </div>
        )}
        <div className="content">
          <ReactMarkdown>{message.content}</ReactMarkdown>
          {message.status === "streaming" && <span className="cursor">▍</span>}
          {message.status === "error" && (
            <span className="failed">failed to generate</span>
          )}
        </div>
        <div className="meta">
          {message.editedAt !== null && <span>edited</span>}
          <span>{time(message.createdAt)}</span>
        </div>
        {reactions.length > 0 && (
          <div className="reactions">
            {reactions.map((emoji) => (
              <button key={emoji} onClick={() => onReact(emoji)}>
                {emoji} 1
              </button>
            ))}
          </div>
        )}
        {!streaming && (
          <div className="actions">
            {REACTION_CHOICES.map((emoji) => (
              <button key={emoji} title="react" onClick={() => onReact(emoji)}>
                {emoji}
              </button>
            ))}
            {onEdit !== null && (
              <button title="edit" onClick={onEdit}>
                ✏️
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function App() {
  const [authReady, setAuthReady] = useState(supabase === null);
  const [identity, setIdentity] = useState("anonymous");

  useEffect(() => {
    if (supabase === null) {
      return;
    }
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session === null) {
        await supabase.auth.signInAnonymously();
      }
      const { data: after } = await supabase.auth.getSession();
      const user = after.session?.user;
      setIdentity(
        user?.email ?? `anonymous · ${(user?.id ?? "").slice(0, 8)}`,
      );
      setAuthReady(true);
    })();
  }, []);

  const client = useMemo(
    () =>
      new HermesClient({
        baseUrl: API_URL,
        ...(supabase === null
          ? {}
          : {
              tokenProvider: async () =>
                (await supabase.auth.getSession()).data.session
                  ?.access_token ?? "",
            }),
      }),
    [],
  );

  const chat = useChat({ client });
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshSessions = useCallback(async () => {
    if (!authReady) {
      return;
    }
    const metas =
      supabase !== null
        ? await client.listSessions()
        : await client.listSessions(localSessionIds());
    setSessions(metas);
  }, [client, authReady]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.messages]);

  useEffect(() => {
    if (chat.sessionId !== null && supabase === null) {
      rememberLocalSession(chat.sessionId);
    }
  }, [chat.sessionId]);

  const submit = async () => {
    const content = draft.trim();
    if ((content === "" && attachments.length === 0) || chat.streaming) {
      return;
    }
    setDraft("");
    setAttachments([]);
    if (editing !== null) {
      const target = editing;
      setEditing(null);
      await chat.edit(target.id, content);
    } else {
      await chat.send(content, attachments);
    }
    await refreshSessions();
  };

  const pickFiles = async (files: FileList | null) => {
    if (files === null) {
      return;
    }
    const loaded = await Promise.all([...files].map(readFileAsDataUrl));
    setAttachments((prev) => [...prev, ...loaded]);
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-head">
          <span>Chats</span>
          <button
            className="new-chat"
            title="new chat"
            onClick={() => {
              chat.reset();
              setEditing(null);
              setDraft("");
            }}
          >
            ＋
          </button>
        </div>
        <div className="session-list">
          {sessions.length === 0 && (
            <div className="session-empty">no conversations yet</div>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              className={`session ${s.id === chat.sessionId ? "active" : ""}`}
              onClick={() => void chat.open(s.id)}
            >
              <span className="session-title">{s.title ?? "New chat"}</span>
              <span className="session-time">{time(s.updatedAt)}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-foot">{identity}</div>
      </aside>

      <div className="app">
        <header>
          <div className="avatar">H</div>
          <div>
            <div className="name">Hermes Agent</div>
            <div className="presence">
              {chat.streaming ? "typing…" : "online · conversations persist"}
            </div>
          </div>
        </header>

        <div className="list" ref={listRef}>
          {chat.messages.length === 0 && (
            <div className="empty">
              <p>✧</p>
              <p>
                Say hi to your Hermes agent. Markdown, image attachments,
                reactions and edits all work — and conversations are saved in
                the sidebar.
              </p>
            </div>
          )}
          {chat.messages.map((message) => (
            <Bubble
              key={message.id}
              message={message}
              streaming={chat.streaming}
              onReact={(emoji) => void chat.react(message.id, emoji)}
              onEdit={
                message.role === "user"
                  ? () => {
                      setEditing(message);
                      setDraft(message.content);
                    }
                  : null
              }
            />
          ))}
          {chat.error !== null && <div className="error">{chat.error}</div>}
        </div>

        <footer>
          {editing !== null && (
            <div className="editing">
              ✏️ editing message
              <button
                onClick={() => {
                  setEditing(null);
                  setDraft("");
                }}
              >
                cancel
              </button>
            </div>
          )}
          {attachments.length > 0 && (
            <div className="previews">
              {attachments.map((a) => (
                <div key={a.name} className="preview">
                  <img src={a.dataUrl} alt={a.name} />
                  <button
                    onClick={() =>
                      setAttachments((prev) => prev.filter((x) => x !== a))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="composer">
            <button
              className="icon"
              title="attach image"
              onClick={() => fileRef.current?.click()}
            >
              📎
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void pickFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <textarea
              placeholder={authReady ? "Message" : "Signing in…"}
              value={draft}
              rows={1}
              disabled={!authReady}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
            <button
              className="send"
              onClick={() => void submit()}
              disabled={chat.streaming || !authReady}
            >
              ➤
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
