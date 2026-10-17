# Lessons

Self-improvement log. After any correction from the user, add the pattern here so the same mistake doesn't recur. Review at the start of each session.

<!-- Format:
## <short title>
**Pattern:** what went wrong / what to do instead.
**Date:** YYYY-MM-DD
-->

## Never edit an already-applied migration
**Pattern:** Changing the SQL of a migration file (in `src-tauri/migrations/`) that has already been applied breaks startup — tauri-plugin-sql uses sqlx, which checksums applied migrations and refuses to open the DB connection on a mismatch. The whole app then shows infinite loading (every query errors → pages that render `isLoading || !data` stay on skeletons). ALWAYS add a NEW migration version + register it in `src-tauri/src/lib.rs`; never modify a shipped/applied one. Recovery if it happens in dev: `DELETE FROM _sqlx_migrations WHERE version = N;` in the app-data DB so the corrected migration re-applies on restart, then restart `pnpm tauri dev` (full restart — HMR won't re-init the Rust DB connection).
**Date:** 2026-06-27

## Duplicate result-column names break the sqlite-proxy
**Pattern:** The `sqlite-proxy` driver maps rows POSITIONALLY via `Object.values(row)` in `db/client.ts`, and `tauri-plugin-sql` returns rows as objects. If a SELECT produces two+ columns with the same name (common when joining tables that each have `title`/`id`/`name`/`created_at`), the duplicate keys collapse in the JS object, `Object.values` returns fewer values, and every field after the collision shifts into the wrong property. Fix: give every selected column a DISTINCT result name. For columns that share an underlying name, alias them with `sql<T>\`table.col\`.as("distinct_name")` (write the qualified name as a literal so it doesn't hit the unqualified-rendering bug below). Only select the columns you need so two tables' `id`/`created_at` don't both appear.
**Date:** 2026-06-28

## Drizzle drops table qualifiers in raw sql`` interpolation
**Pattern:** Interpolating columns into `sql\`...\`` (e.g. `${tasks.id}`) renders the bare column name, not `"table"."column"`. In a correlated subquery this silently collides (e.g. `time_entries.id` shadowing `tasks.id`) and sums to 0. Write correlated subqueries with explicit table-qualified raw SQL and aliases (`te.task_id = tasks.id`).
**Date:** 2026-06-27

## The real database can differ from the migration files
**Pattern:** An early, later-edited version of migration 2 left an (always empty) `task_id` column on `invoice_line_items` in the real database, while a fresh install never gets it — so `ALTER TABLE … ADD task_id` crashed on the real DB only. Before shipping a migration, run it with `sqlite3 -bail` inside `BEGIN/COMMIT` against BOTH a copy of the real app-data DB and a fresh DB built from all migrations. When a column may or may not exist, rebuild the table (create new → copy known columns → drop → rename) instead of ALTER.
**Date:** 2026-10-04

## Multi-step writes go through db.batch
**Pattern:** tauri-plugin-sql pools connections, so separate `execute` calls are never one transaction (BEGIN/COMMIT across IPC calls can land on different connections). Use `db.batch([...])` — backed by the `execute_batch` Rust command (src-tauri/src/batch.rs) running one sqlx transaction. Batches are write-only: do reads first, pre-generate ids with `newId()` instead of `.returning()`.
**Date:** 2026-10-04

## Snapshot the live database with .backup, never cp
**Pattern:** The app runs SQLite in WAL mode, so recent changes (even applied migrations) can sit in `timekit.db-wal`. `cp timekit.db` gives a stale copy — a migration test on it showed columns "missing" that existed. Take test copies with `sqlite3 timekit.db ".backup 'copy.db'"` (needs the sandbox lifted: it touches the -shm file in Application Support).
**Date:** 2026-10-04
