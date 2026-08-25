import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Attachment, ChatMessage, ChatSessionMeta } from "./types.ts";

export function randomId(): string {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface SessionRow {
  id: string;
  user_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: string;
  reactions: string;
  created_at: string;
  edited_at: string | null;
  status: ChatMessage["status"];
}

export function toMessage(row: MessageRow): ChatMessage {
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

export function toMeta(row: SessionRow): ChatSessionMeta {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function openDatabase(path: string): Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.run(`
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
  return db;
}
