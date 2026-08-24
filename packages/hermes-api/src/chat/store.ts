import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface Attachment {
  name: string;
  type: string;
  dataUrl: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: Attachment[];
  reactions: Record<string, number>;
  createdAt: string;
  editedAt: string | null;
  status: "streaming" | "done" | "error";
}

export interface ChatSessionMeta {
  id: string;
  userId: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSession extends ChatSessionMeta {
  messages: ChatMessage[];
}

function randomId(): string {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

interface SessionRow {
  id: string;
  user_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: string;
  reactions: string;
  created_at: string;
  edited_at: string | null;
  status: ChatMessage["status"];
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    attachments: JSON.parse(row.attachments) as Attachment[],
    reactions: JSON.parse(row.reactions) as Record<string, number>,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    status: row.status,
  };
}

function toMeta(row: SessionRow): ChatSessionMeta {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** SQLite-backed chat store; pass ":memory:" (default) for ephemeral use. */
export class ChatStore {
  private readonly db: Database;

  constructor(
    path = ":memory:",
    private readonly now: () => Date = () => new Date(),
  ) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new Database(path);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        title TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        attachments TEXT NOT NULL,
        reactions TEXT NOT NULL,
        created_at TEXT NOT NULL,
        edited_at TEXT,
        status TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session
        ON messages (session_id, position);
    `);
  }

  private touch(sessionId: string): void {
    this.db.run("UPDATE sessions SET updated_at = ? WHERE id = ?", [
      this.now().toISOString(),
      sessionId,
    ]);
  }

  createSession(userId: string | null = null): ChatSession {
    const id = randomId();
    const at = this.now().toISOString();
    this.db.run(
      "INSERT INTO sessions (id, user_id, title, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)",
      [id, userId, at, at],
    );
    return { id, userId, title: null, createdAt: at, updatedAt: at, messages: [] };
  }

  getSession(id: string): ChatSession | null {
    const row = this.db
      .query<SessionRow, [string]>("SELECT * FROM sessions WHERE id = ?")
      .get(id);
    if (row === null) {
      return null;
    }
    const messages = this.db
      .query<MessageRow, [string]>(
        "SELECT * FROM messages WHERE session_id = ? ORDER BY position",
      )
      .all(id)
      .map(toMessage);
    return { ...toMeta(row), messages };
  }

  listSessions(input: { userId?: string; ids?: string[] }): ChatSessionMeta[] {
    if (input.userId !== undefined) {
      return this.db
        .query<SessionRow, [string]>(
          "SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC",
        )
        .all(input.userId)
        .map(toMeta);
    }
    const ids = input.ids ?? [];
    if (ids.length === 0) {
      return [];
    }
    const placeholders = ids.map(() => "?").join(",");
    return this.db
      .query<SessionRow, string[]>(
        `SELECT * FROM sessions WHERE id IN (${placeholders}) ORDER BY updated_at DESC`,
      )
      .all(...ids)
      .map(toMeta);
  }

  deleteSession(id: string): boolean {
    const existing = this.db
      .query<SessionRow, [string]>("SELECT * FROM sessions WHERE id = ?")
      .get(id);
    if (existing === null) {
      return false;
    }
    this.db.run("DELETE FROM messages WHERE session_id = ?", [id]);
    this.db.run("DELETE FROM sessions WHERE id = ?", [id]);
    return true;
  }

  addMessage(
    sessionId: string,
    input: {
      role: ChatMessage["role"];
      content: string;
      attachments?: Attachment[];
      status?: ChatMessage["status"];
    },
  ): ChatMessage | null {
    const session = this.db
      .query<SessionRow, [string]>("SELECT * FROM sessions WHERE id = ?")
      .get(sessionId);
    if (session === null) {
      return null;
    }
    const position =
      (this.db
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
      createdAt: this.now().toISOString(),
      editedAt: null,
      status: input.status ?? "done",
    };
    this.db.run(
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
      this.db.run("UPDATE sessions SET title = ? WHERE id = ?", [
        input.content.slice(0, 48),
        sessionId,
      ]);
    }
    this.touch(sessionId);
    return message;
  }

  private messageRow(sessionId: string, messageId: string): MessageRow | null {
    return this.db
      .query<MessageRow, [string, string]>(
        "SELECT * FROM messages WHERE session_id = ? AND id = ?",
      )
      .get(sessionId, messageId);
  }

  getMessage(sessionId: string, messageId: string): ChatMessage | null {
    const row = this.messageRow(sessionId, messageId);
    return row === null ? null : toMessage(row);
  }

  appendContent(sessionId: string, messageId: string, text: string): void {
    this.db.run(
      "UPDATE messages SET content = content || ? WHERE session_id = ? AND id = ?",
      [text, sessionId, messageId],
    );
  }

  finishMessage(
    sessionId: string,
    messageId: string,
    status: "done" | "error",
  ): ChatMessage | null {
    const row = this.messageRow(sessionId, messageId);
    if (row === null) {
      return null;
    }
    this.db.run("UPDATE messages SET status = ? WHERE session_id = ? AND id = ?", [
      status,
      sessionId,
      messageId,
    ]);
    this.touch(sessionId);
    return this.getMessage(sessionId, messageId);
  }

  /** Replaces a user message's content and drops everything after it. */
  editMessage(
    sessionId: string,
    messageId: string,
    content: string,
  ): ChatMessage | null {
    const row = this.messageRow(sessionId, messageId);
    if (row === null || row.role !== "user") {
      return null;
    }
    const position = (this.db
      .query<{ position: number }, [string, string]>(
        "SELECT position FROM messages WHERE session_id = ? AND id = ?",
      )
      .get(sessionId, messageId) as { position: number }).position;
    this.db.run(
      "DELETE FROM messages WHERE session_id = ? AND position > ?",
      [sessionId, position],
    );
    this.db.run(
      "UPDATE messages SET content = ?, edited_at = ? WHERE session_id = ? AND id = ?",
      [content, this.now().toISOString(), sessionId, messageId],
    );
    this.touch(sessionId);
    return this.getMessage(sessionId, messageId);
  }

  toggleReaction(
    sessionId: string,
    messageId: string,
    emoji: string,
  ): ChatMessage | null {
    const message = this.getMessage(sessionId, messageId);
    if (message === null) {
      return null;
    }
    if (message.reactions[emoji] === undefined) {
      message.reactions[emoji] = 1;
    } else {
      delete message.reactions[emoji];
    }
    this.db.run(
      "UPDATE messages SET reactions = ? WHERE session_id = ? AND id = ?",
      [JSON.stringify(message.reactions), sessionId, messageId],
    );
    return message;
  }
}
