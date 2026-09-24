import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ChatMessage } from "@intheloop-studio/hermes-remote-react";

const REACTIONS = ["👍", "❤️", "😂", "🔥", "🤔"];

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** One message: markdown for the agent, plain text for the person. */
export function Message({
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
  const [picking, setPicking] = useState(false);
  const mine = message.role === "user";
  const reactions = Object.entries(message.reactions).filter(([, count]) => count > 0);
  return (
    <article className={`message ${mine ? "mine" : "theirs"}`} aria-label={mine ? "You" : "Agent"}>
      {message.attachments.length > 0 && (
        <div className="attachments">
          {message.attachments.map((a) => (
            <img key={a.name} src={a.dataUrl} alt={a.name} />
          ))}
        </div>
      )}
      <div className="body">
        {mine ? (
          <p>{message.content}</p>
        ) : message.content === "" && streaming ? (
          <p className="muted">Thinking…</p>
        ) : (
          <ReactMarkdown>{message.content}</ReactMarkdown>
        )}
        {message.status === "error" && (
          <p className="error">This reply didn't finish. Send your message again to retry.</p>
        )}
      </div>
      <footer className="meta">
        <time dateTime={message.createdAt}>{time(message.createdAt)}</time>
        {message.editedAt !== null && <span>edited</span>}
        {reactions.map(([emoji, count]) => (
          <button
            key={emoji}
            type="button"
            className="reaction on"
            aria-label={`Remove ${emoji} reaction (${count})`}
            onClick={() => onReact(emoji)}
          >
            {emoji} {count}
          </button>
        ))}
        {!mine && message.status === "done" && (
          <span className="react">
            <button
              type="button"
              className="icon-button"
              aria-label="Add a reaction"
              aria-expanded={picking}
              onClick={() => setPicking((open) => !open)}
            >
              ☺
            </button>
            {picking && (
              <span className="picker" role="group" aria-label="Reactions">
                {REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="reaction"
                    aria-label={`React with ${emoji}`}
                    onClick={() => {
                      setPicking(false);
                      onReact(emoji);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </span>
            )}
          </span>
        )}
        {onEdit !== null && (
          <button type="button" className="link" onClick={onEdit}>
            Edit
          </button>
        )}
      </footer>
    </article>
  );
}
