import type { Database } from "bun:sqlite";
import { randomId, toMessage, type MessageRow, type SessionRow } from "./db.ts";
import type { Attachment, ChatMessage } from "./types.ts";

function touch(db: Database, now: () => Date, sessionId: string): void {
  db.run("UPDATE sessions SET updated_at = ? WHERE id = ?", [
    now().toISOString(),
    sessionId,
  ]);
}

function messageRow(
  db: Database,
  sessionId: string,
  messageId: string,
): MessageRow | null {
  return db
    .query<MessageRow, [string, string]>(
      "SELECT * FROM messages WHERE session_id = ? AND id = ?",
    )
    .get(sessionId, messageId);
}

export function getMessage(
  db: Database,
  sessionId: string,
  messageId: string,
): ChatMessage | null {
  const row = messageRow(db, sessionId, messageId);
  return row === null ? null : toMessage(row);
}

export function addMessage(
  db: Database,
  now: () => Date,
  sessionId: string,
  input: {
    role: ChatMessage["role"];
    content: string;
    attachments?: Attachment[];
    status?: ChatMessage["status"];
  },
): ChatMessage | null {
  const session = db
    .query<SessionRow, [string]>("SELECT * FROM sessions WHERE id = ?")
    .get(sessionId);
  if (session === null) {
    return null;
  }
  const position =
    (db
      .query<{ n: number }, [string]>(
        "SELECT COALESCE(MAX(position), -1) + 1 AS n FROM messages WHERE session_id = ?",
      )
      .get(sessionId) as { n: number }).n;
  const message: ChatMessage = {
    id: randomId(),
    role: input.role,
    content: input.content,
    attachments: input.attachments ?? [],
    reactions: {},
    createdAt: now().toISOString(),
    editedAt: null,
    status: input.status ?? "done",
  };
  db.run(
    `INSERT INTO messages
      (id, session_id, position, role, content, attachments, reactions, created_at, edited_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    [
      message.id,
      sessionId,
      position,
      message.role,
      message.content,
      JSON.stringify(message.attachments),
      JSON.stringify(message.reactions),
      message.createdAt,
      message.status,
    ],
  );
  if (session.title === null && input.role === "user" && input.content !== "") {
    db.run("UPDATE sessions SET title = ? WHERE id = ?", [
      input.content.slice(0, 48),
      sessionId,
    ]);
  }
  touch(db, now, sessionId);
  return message;
}

export function appendContent(
  db: Database,
  sessionId: string,
  messageId: string,
  text: string,
): void {
  db.run(
    "UPDATE messages SET content = content || ? WHERE session_id = ? AND id = ?",
    [text, sessionId, messageId],
  );
}

export function finishMessage(
  db: Database,
  now: () => Date,
  sessionId: string,
  messageId: string,
  status: "done" | "error",
): ChatMessage | null {
  const row = messageRow(db, sessionId, messageId);
  if (row === null) {
    return null;
  }
  db.run("UPDATE messages SET status = ? WHERE session_id = ? AND id = ?", [
    status,
    sessionId,
    messageId,
  ]);
  touch(db, now, sessionId);
  return getMessage(db, sessionId, messageId);
}

/** Replaces a user message's content and drops everything after it. */
export function editMessage(
  db: Database,
  now: () => Date,
  sessionId: string,
  messageId: string,
  content: string,
): ChatMessage | null {
  const row = messageRow(db, sessionId, messageId);
  if (row === null || row.role !== "user") {
    return null;
  }
  const position = (db
    .query<{ position: number }, [string, string]>(
      "SELECT position FROM messages WHERE session_id = ? AND id = ?",
    )
    .get(sessionId, messageId) as { position: number }).position;
  db.run(
    "DELETE FROM messages WHERE session_id = ? AND position > ?",
    [sessionId, position],
  );
  db.run(
    "UPDATE messages SET content = ?, edited_at = ? WHERE session_id = ? AND id = ?",
    [content, now().toISOString(), sessionId, messageId],
  );
  touch(db, now, sessionId);
  return getMessage(db, sessionId, messageId);
}

export function toggleReaction(
  db: Database,
  sessionId: string,
  messageId: string,
  emoji: string,
): ChatMessage | null {
  const message = getMessage(db, sessionId, messageId);
  if (message === null) {
    return null;
  }
  if (message.reactions[emoji] === undefined) {
    message.reactions[emoji] = 1;
  } else {
    delete message.reactions[emoji];
  }
  db.run(
    "UPDATE messages SET reactions = ? WHERE session_id = ? AND id = ?",
    [JSON.stringify(message.reactions), sessionId, messageId],
  );
  return message;
}
