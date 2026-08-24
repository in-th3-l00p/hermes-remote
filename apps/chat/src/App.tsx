import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { HermesClient, useChat } from "@in-th3-l00p/hermes-web-react";
import type { Attachment, ChatMessage } from "@in-th3-l00p/hermes-web-react";

const client = new HermesClient({
  baseUrl: import.meta.env["VITE_HERMES_API_URL"] ?? "http://localhost:8643",
});

const REACTION_CHOICES = ["👍", "❤️", "😂", "🔥", "🤔"];

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
  const chat = useChat({ client });
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.messages]);

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
  };

  const pickFiles = async (files: FileList | null) => {
    if (files === null) {
      return;
    }
    const loaded = await Promise.all([...files].map(readFileAsDataUrl));
    setAttachments((prev) => [...prev, ...loaded]);
  };

  return (
    <div className="app">
      <header>
        <div className="avatar">H</div>
        <div>
          <div className="name">Hermes Agent</div>
          <div className="presence">
            {chat.streaming ? "typing…" : "online · anonymous session"}
          </div>
        </div>
      </header>

      <div className="list" ref={listRef}>
        {chat.messages.length === 0 && (
          <div className="empty">
            <p>✧</p>
            <p>
              Say hi to your Hermes agent. Markdown, image attachments,
              reactions and edits all work — and the agent never learns who you
              are.
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
            placeholder="Message"
            value={draft}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <button className="send" onClick={() => void submit()} disabled={chat.streaming}>
            ➤
          </button>
        </div>
      </footer>
    </div>
  );
}
