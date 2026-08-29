import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

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
    this.db.run(
      `CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        principal TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
    );
  }

  record(id: string, principal: string): RunRecord {
    const createdAt = this.now().toISOString();
    this.db
      .query("INSERT INTO runs (id, principal, created_at) VALUES (?, ?, ?)")
      .run(id, principal, createdAt);
    return { id, principal, createdAt };
  }

  get(id: string): RunRecord | null {
    const row = this.db
      .query<RunRow, [string]>("SELECT * FROM runs WHERE id = ?")
      .get(id);
    return row === null ? null : toRecord(row);
  }

  list(principal: string | null): RunRecord[] {
    const rows =
      principal === null
        ? this.db
            .query<RunRow, []>(
              "SELECT * FROM runs ORDER BY created_at DESC, id DESC",
            )
            .all()
        : this.db
            .query<RunRow, [string]>(
              "SELECT * FROM runs WHERE principal = ? ORDER BY created_at DESC, id DESC",
            )
            .all(principal);
    return rows.map(toRecord);
  }
}
