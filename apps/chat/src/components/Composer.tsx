import { useEffect, useRef, useState } from "react";
import type { Attachment, ChatMessage } from "@intheloop-studio/hermes-remote-react";
import { ACCEPTED_TYPES, readAttachment } from "../lib/attachments.ts";

/** The message box: attach images, send, and stop a reply mid-stream. */
export function Composer({
  streaming,
  editing,
  onSend,
  onStop,
  onCancelEdit,
}: {
  streaming: boolean;
  editing: ChatMessage | null;
  onSend: (content: string, attachments: Attachment[]) => void;
  onStop: () => void;
  onCancelEdit: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const files = useRef<HTMLInputElement>(null);

  // Editing loads the message into the box and puts the cursor there.
  useEffect(() => {
    if (editing !== null) {
      setDraft(editing.content);
      box.current?.focus();
    }
  }, [editing]);

  const submit = () => {
    const content = draft.trim();
    if (streaming || (content === "" && attachments.length === 0)) {
      return;
    }
    onSend(content, attachments);
    setDraft("");
    setAttachments([]);
    setProblem(null);
  };

  const pick = async (list: FileList | null) => {
    if (list === null) {
      return;
    }
    const results = await Promise.allSettled([...list].map(readAttachment));
    setAttachments((prev) => [
      ...prev,
      ...results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
    ]);
    const failed = results.flatMap((r) =>
      r.status === "rejected" ? [(r.reason as Error).message] : [],
    );
    setProblem(failed.length === 0 ? null : failed.join(". "));
    if (files.current !== null) {
      files.current.value = "";
    }
  };

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {editing !== null && (
        <p className="composer-note">
          Editing your message: sending replaces it and regenerates the reply.{" "}
          <button
            type="button"
            className="link"
            onClick={() => {
              setDraft("");
              onCancelEdit();
            }}
          >
            Cancel
          </button>
        </p>
      )}
      {attachments.length > 0 && (
        <ul className="pending" aria-label="Attached images">
          {attachments.map((a, i) => (
            <li key={`${a.name}-${i}`}>
              <img src={a.dataUrl} alt="" />
              <span>{a.name}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${a.name}`}
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {problem !== null && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <div className="composer-row">
        <input
          ref={files}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          hidden
          onChange={(e) => void pick(e.target.files)}
        />
        {editing === null && (
          <button
            type="button"
            className="icon-button"
            aria-label="Attach images"
            onClick={() => files.current?.click()}
          >
            +
          </button>
        )}
        <label htmlFor="draft" className="visually-hidden">
          Message
        </label>
        <textarea
          id="draft"
          ref={box}
          rows={1}
          placeholder="Message the agent"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {streaming ? (
          <button type="button" className="button" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button type="submit" className="button primary">
            {editing === null ? "Send" : "Save"}
          </button>
        )}
      </div>
    </form>
  );
}
