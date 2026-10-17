import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { invoke } from "@tauri-apps/api/core";
import * as schema from "./schema";

/**
 * Typed Drizzle client backed by the Rust database layer (`src-tauri/src/db.rs`).
 *
 * Drizzle builds the SQL in the WebView; Rust executes it with libsql over IPC,
 * against the local SQLite file or, when sync is on, the local Turso replica
 * (reads stay local, writes go to Turso). Rows come back as arrays, the shape
 * sqlite-proxy expects.
 *
 * `db.batch([...])` runs write statements in ONE database transaction (all or
 * nothing) through the `db_batch` command. Batches are write-only: put reads
 * before the batch.
 *
 * @example
 * const all = await db.select().from(projects);
 * await db.batch([db.insert(invoices).values(invoice), db.insert(invoiceEntries).values(claims)]);
 */
export const db: SqliteRemoteDatabase<typeof schema> = drizzle(
  async (sql, params, method) => {
    const rows = await invoke<unknown[][]>("db_query", { sql, params, method });
    return { rows: method === "get" ? (rows[0] ?? []) : rows };
  },
  async (queries) => {
    if (queries.some((query) => query.method !== "run")) {
      throw new Error("db.batch only supports write statements without .returning()");
    }
    await invoke("db_batch", {
      statements: queries.map((query) => ({ sql: query.sql, params: query.params })),
    });
    return queries.map(() => ({ rows: [] }));
  },
  { schema },
);
