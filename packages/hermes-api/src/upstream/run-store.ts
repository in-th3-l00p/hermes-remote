import { Database } from "bun:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { HermesUpstreamError } from "../chat/index.ts";

export interface RunRecord {
  id: string;
  principal: string;
  createdAt: string;
}

interface RunRow {
  id: string;
  principal: string;
  created_at: string;
}

function toRecord(row: RunRow): RunRecord {
  return { id: row.id, principal: row.principal, createdAt: row.created_at };
}

/** Maps upstream run ids to the principal that created them. */
export class RunStore {
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
    this.db.run(
      `CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        principal TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
    );
  }

  /**
   * Records who created a run. A run id already owned by someone else is
   * refused rather than reassigned, so ownership can never move.
   */
  record(id: string, principal: string): RunRecord {
    const createdAt = this.now().toISOString();
    this.db
      .query("INSERT OR IGNORE INTO runs (id, principal, created_at) VALUES (?, ?, ?)")
      .run(id, principal, createdAt);
    const stored = this.get(id) as RunRecord;
    if (stored.principal !== principal) {
      throw new HermesUpstreamError(502, "Upstream reused a run id owned by another caller");
    }
    return stored;
  }

  get(id: string): RunRecord | null {
    const row = this.db.query<RunRow, [string]>("SELECT * FROM runs WHERE id = ?").get(id);
    return row === null ? null : toRecord(row);
  }

  list(principal: string | null): RunRecord[] {
    const rows =
      principal === null
        ? this.db.query<RunRow, []>("SELECT * FROM runs ORDER BY created_at DESC, id DESC").all()
        : this.db
            .query<RunRow, [string]>(
              "SELECT * FROM runs WHERE principal = ? ORDER BY created_at DESC, id DESC",
            )
            .all(principal);
    return rows.map(toRecord);
  }
}
