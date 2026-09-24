import { Database } from "bun:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type AgentVisibility = "anonymous" | "pseudonymous" | "full";

export interface UserIdentity {
  provider: string;
  subject: string;
}

/** A platform user known to hermes-remote through token exchange. */
export interface User {
  id: string;
  identities: UserIdentity[];
  /** Shared with the agent only when visibility is "full". */
  profile: Record<string, unknown>;
  /** Platform-private; never shown to the agent. */
  metadata: Record<string, unknown>;
  agentVisibility: AgentVisibility;
  disabled: boolean;
  /** Bumped on disable; tokens minted for an older generation stop working. */
  generation: number;
  createdAt: string;
  updatedAt: string;
}

interface UserRow {
  id: string;
  profile: string;
  metadata: string;
  agent_visibility: AgentVisibility;
  disabled: number;
  generation: number;
  created_at: string;
  updated_at: string;
}

export const VISIBILITIES: readonly AgentVisibility[] = ["anonymous", "pseudonymous", "full"];

function newUserId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return `usr_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** SQLite-backed user records and their external identities. */
export class UserStore {
  private readonly db: Database;

  constructor(
    path = ":memory:",
    private readonly now: () => Date = () => new Date(),
  ) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new Database(path);
    if (path !== ":memory:") {
      chmodSync(path, 0o600);
    }
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        profile TEXT NOT NULL,
        metadata TEXT NOT NULL,
        agent_visibility TEXT NOT NULL,
        disabled INTEGER NOT NULL DEFAULT 0,
        generation INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_identities (
        provider TEXT NOT NULL,
        subject TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (provider, subject)
      );
    `);
  }

  private hydrate(row: UserRow): User {
    const identities = this.db
      .query<UserIdentity, [string]>(
        "SELECT provider, subject FROM user_identities WHERE user_id = ? ORDER BY provider",
      )
      .all(row.id);
    return {
      id: row.id,
      identities,
      profile: JSON.parse(row.profile) as Record<string, unknown>,
      metadata: JSON.parse(row.metadata) as Record<string, unknown>,
      agentVisibility: row.agent_visibility,
      disabled: row.disabled === 1,
      generation: row.generation,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  get(id: string): User | null {
    const row = this.db.query<UserRow, [string]>("SELECT * FROM users WHERE id = ?").get(id);
    return row === null ? null : this.hydrate(row);
  }

  findByIdentity(identity: UserIdentity): User | null {
    const row = this.db
      .query<UserRow, [string, string]>(
        `SELECT u.* FROM users u JOIN user_identities i ON i.user_id = u.id
         WHERE i.provider = ? AND i.subject = ?`,
      )
      .get(identity.provider, identity.subject);
    return row === null ? null : this.hydrate(row);
  }

  list(limit: number, offset: number): { users: User[]; total: number } {
    const rows = this.db
      .query<UserRow, [number, number]>(
        "SELECT * FROM users ORDER BY created_at, id LIMIT ? OFFSET ?",
      )
      .all(limit, offset);
    const total = (
      this.db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM users").get() as { n: number }
    ).n;
    return { users: rows.map((r) => this.hydrate(r)), total };
  }

  /**
   * Finds the user for an external identity, creating it when missing. Given
   * profile/metadata/visibility replace the stored values.
   */
  upsert(
    identity: UserIdentity,
    changes: {
      profile?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      agentVisibility?: AgentVisibility;
    } = {},
  ): User {
    const existing = this.findByIdentity(identity);
    if (existing !== null) {
      return this.update(existing.id, changes) as User;
    }
    const id = newUserId();
    const at = this.now().toISOString();
    this.db.run(
      "INSERT INTO users (id, profile, metadata, agent_visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        id,
        JSON.stringify(changes.profile ?? {}),
        JSON.stringify(changes.metadata ?? {}),
        changes.agentVisibility ?? "anonymous",
        at,
        at,
      ],
    );
    this.db.run("INSERT INTO user_identities (provider, subject, user_id) VALUES (?, ?, ?)", [
      identity.provider,
      identity.subject,
      id,
    ]);
    return this.get(id) as User;
  }

  update(
    id: string,
    changes: {
      profile?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      agentVisibility?: AgentVisibility;
    },
  ): User | null {
    const user = this.get(id);
    if (user === null) {
      return null;
    }
    this.db.run(
      "UPDATE users SET profile = ?, metadata = ?, agent_visibility = ?, updated_at = ? WHERE id = ?",
      [
        JSON.stringify(changes.profile ?? user.profile),
        JSON.stringify(changes.metadata ?? user.metadata),
        changes.agentVisibility ?? user.agentVisibility,
        this.now().toISOString(),
        id,
      ],
    );
    return this.get(id);
  }

  /** Disabling bumps the generation, which invalidates outstanding tokens. */
  setDisabled(id: string, disabled: boolean): User | null {
    if (this.get(id) === null) {
      return null;
    }
    this.db.run(
      `UPDATE users SET disabled = ?, generation = generation + ?, updated_at = ? WHERE id = ?`,
      [disabled ? 1 : 0, disabled ? 1 : 0, this.now().toISOString(), id],
    );
    return this.get(id);
  }

  delete(id: string): boolean {
    if (this.get(id) === null) {
      return false;
    }
    this.db.run("DELETE FROM user_identities WHERE user_id = ?", [id]);
    this.db.run("DELETE FROM users WHERE id = ?", [id]);
    return true;
  }

  /** Links another identity; false when it already belongs to someone. */
  link(id: string, identity: UserIdentity): boolean {
    const owner = this.findByIdentity(identity);
    if (owner !== null) {
      return owner.id === id;
    }
    this.db.run("INSERT INTO user_identities (provider, subject, user_id) VALUES (?, ?, ?)", [
      identity.provider,
      identity.subject,
      id,
    ]);
    return true;
  }

  /** Unlinks a provider; the last identity can't be removed. */
  unlink(id: string, provider: string): boolean {
    const user = this.get(id);
    if (user === null || user.identities.length <= 1) {
      return false;
    }
    const result = this.db.run("DELETE FROM user_identities WHERE user_id = ? AND provider = ?", [
      id,
      provider,
    ]);
    return result.changes > 0;
  }
}
