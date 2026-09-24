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
    // Turns cut short by a crash or restart can never finish.
    this.db.run("UPDATE messages SET status = 'error' WHERE status = 'streaming'");
  }

  createSession(
    owner: { userId?: string | null; keyId?: string | null } = {},
  ): ChatSession {
    const id = randomId();
    const at = this.now().toISOString();
    const userId = owner.userId ?? null;
    const keyId = owner.keyId ?? null;
    this.db.run(
      "INSERT INTO sessions (id, user_id, key_id, title, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)",
      [id, userId, keyId, at, at],
    );
    return {
      id,
      userId,
      keyId,
      title: null,
      archived: false,
      createdAt: at,
      updatedAt: at,
      messages: [],
    };
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

  /** Owner-scoped listing; archived sessions only when `archived` is true. */
  listSessions(input: {
    userId?: string;
    keyId?: string;
    ids?: string[];
    archived?: boolean;
  }): ChatSessionMeta[] {
    const archived = input.archived === true ? 1 : 0;
    if (input.userId !== undefined) {
      return this.db
        .query<SessionRow, [string, number]>(
          "SELECT * FROM sessions WHERE user_id = ? AND archived = ? ORDER BY updated_at DESC",
        )
        .all(input.userId, archived)
        .map(toMeta);
    }
    if (input.keyId !== undefined) {
      return this.db
        .query<SessionRow, [string, number]>(
          "SELECT * FROM sessions WHERE key_id = ? AND archived = ? ORDER BY updated_at DESC",
        )
        .all(input.keyId, archived)
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

  /** Renames and/or archives a session; null when it doesn't exist. */
  updateSession(
    id: string,
    changes: { title?: string; archived?: boolean },
  ): ChatSessionMeta | null {
    if (changes.title !== undefined) {
      this.db.run("UPDATE sessions SET title = ? WHERE id = ?", [changes.title, id]);
    }
    if (changes.archived !== undefined) {
      this.db.run("UPDATE sessions SET archived = ? WHERE id = ?", [
        changes.archived ? 1 : 0,
        id,
      ]);
    }
    const row = this.db
      .query<SessionRow, [string]>("SELECT * FROM sessions WHERE id = ?")
      .get(id);
    return row === null ? null : toMeta(row);
  }

  /**
   * Copies a session's finished messages, up to and including `untilMessageId`
   * when given, into a new session with the given owner.
   */
  forkSession(
    id: string,
    owner: { userId?: string | null; keyId?: string | null },
    untilMessageId?: string,
  ): ChatSession | null {
    const source = this.getSession(id);
    if (source === null) {
      return null;
    }
    const cut =
      untilMessageId === undefined
        ? source.messages.length
        : source.messages.findIndex((m) => m.id === untilMessageId) + 1;
    if (cut === 0) {
      return null;
    }
    const fork = this.createSession(owner);
    for (const m of source.messages.slice(0, cut).filter((m) => m.status === "done")) {
      this.addMessage(fork.id, {
        role: m.role,
        content: m.content,
        attachments: m.attachments,
        status: "done",
      });
    }
    this.updateSession(fork.id, { title: `${source.title ?? "Untitled"} (fork)` });
    return this.getSession(fork.id);
  }

  /** Case-insensitive match on titles and message text, within one owner. */
  searchSessions(
    owner: { userId: string } | { keyId: string },
    query: string,
    limit: number,
  ): ChatSessionMeta[] {
    const column = "userId" in owner ? "user_id" : "key_id";
    const value = "userId" in owner ? owner.userId : owner.keyId;
    const pattern = `%${query.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    return this.db
      .query<SessionRow, [string, string, string, number]>(
        `SELECT * FROM sessions s WHERE s.${column} = ? AND (
           s.title LIKE ? ESCAPE '\\'
           OR EXISTS (SELECT 1 FROM messages m WHERE m.session_id = s.id AND m.content LIKE ? ESCAPE '\\')
         ) ORDER BY s.updated_at DESC LIMIT ?`,
      )
      .all(value, pattern, pattern, limit)
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
