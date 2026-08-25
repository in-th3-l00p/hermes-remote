import type { Database } from "bun:sqlite";
import {
  openDatabase,
  randomId,
  toMessage,
  toMeta,
  type MessageRow,
  type SessionRow,
} from "./db.ts";
import * as messages from "./messages.ts";
import type { Attachment, ChatMessage, ChatSession, ChatSessionMeta } from "./types.ts";

export type { Attachment, ChatMessage, ChatSession, ChatSessionMeta } from "./types.ts";

/** SQLite-backed chat store; pass ":memory:" (default) for ephemeral use. */
export class ChatStore {
  private readonly db: Database;

  constructor(
    path = ":memory:",
    private readonly now: () => Date = () => new Date(),
  ) {
    this.db = openDatabase(path);
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
    const sessionMessages = this.db
      .query<MessageRow, [string]>(
        "SELECT * FROM messages WHERE session_id = ? ORDER BY position",
      )
      .all(id)
      .map(toMessage);
    return { ...toMeta(row), messages: sessionMessages };
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
    return messages.addMessage(this.db, this.now, sessionId, input);
  }

  getMessage(sessionId: string, messageId: string): ChatMessage | null {
    return messages.getMessage(this.db, sessionId, messageId);
  }

  appendContent(sessionId: string, messageId: string, text: string): void {
    messages.appendContent(this.db, sessionId, messageId, text);
  }

  finishMessage(
    sessionId: string,
    messageId: string,
    status: "done" | "error",
  ): ChatMessage | null {
    return messages.finishMessage(this.db, this.now, sessionId, messageId, status);
  }

  editMessage(
    sessionId: string,
    messageId: string,
    content: string,
  ): ChatMessage | null {
    return messages.editMessage(this.db, this.now, sessionId, messageId, content);
  }

  toggleReaction(
    sessionId: string,
    messageId: string,
    emoji: string,
  ): ChatMessage | null {
    return messages.toggleReaction(this.db, sessionId, messageId, emoji);
  }
}
