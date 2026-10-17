//! Schema migrations.
//!
//! Applied versions are recorded in `_sqlx_migrations`, the table
//! tauri-plugin-sql (sqlx) used before, so databases created by the old
//! plugin are recognised as already migrated. A migration file `000N_*.sql`
//! is version N+1.

use std::collections::HashSet;

use libsql::{params, Connection};

struct Migration {
    version: i64,
    description: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        description: "create initial schema",
        sql: include_str!("../migrations/0000_ancient_midnight.sql"),
    },
    Migration {
        version: 2,
        description: "create invoice_tasks table",
        sql: include_str!("../migrations/0001_task_line_items.sql"),
    },
    Migration {
        version: 3,
        description: "add entries_json to invoice line items",
        sql: include_str!("../migrations/0002_invoice_line_entries.sql"),
    },
    Migration {
        version: 4,
        description: "create task_links table",
        sql: include_str!("../migrations/0003_task_links.sql"),
    },
    Migration {
        version: 5,
        description: "drop settings.next_invoice_seq",
        sql: include_str!("../migrations/0004_drop_next_invoice_seq.sql"),
    },
    Migration {
        version: 6,
        description: "bill per time entry, indexes, invoice numbering",
        sql: include_str!("../migrations/0005_entry_billing.sql"),
    },
    Migration {
        version: 7,
        description: "per-customer invoice series and language",
        sql: include_str!("../migrations/0006_customer_invoice_series.sql"),
    },
    Migration {
        version: 8,
        description: "bookkeeping: moms registration, expenses, backups",
        sql: include_str!("../migrations/0007_bookkeeping.sql"),
    },
    Migration {
        version: 9,
        description: "company registration date",
        sql: include_str!("../migrations/0008_company_registration.sql"),
    },
    Migration {
        version: 10,
        description: "monthly subscriptions",
        sql: include_str!("../migrations/0009_subscriptions.sql"),
    },
    Migration {
        version: 11,
        description: "subscription description",
        sql: include_str!("../migrations/0010_subscription_details.sql"),
    },
    Migration {
        version: 12,
        description: "invoice lines remember their subscription",
        sql: include_str!("../migrations/0011_line_subscription.sql"),
    },
    Migration {
        version: 13,
        description: "payment terms per customer",
        sql: include_str!("../migrations/0012_customer_payment_terms.sql"),
    },
];

/// Same shape as sqlx's table, so old and new databases look alike.
const CREATE_TABLE: &str = "CREATE TABLE IF NOT EXISTS _sqlx_migrations (
    version BIGINT PRIMARY KEY,
    description TEXT NOT NULL,
    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,
    checksum BLOB NOT NULL,
    execution_time BIGINT NOT NULL
)";

/// Applies every migration not yet recorded, each in its own transaction.
pub async fn run(conn: &Connection) -> Result<(), String> {
    conn.execute(CREATE_TABLE, ()).await.map_err(|e| e.to_string())?;

    let mut applied = HashSet::new();
    let mut rows = conn
        .query("SELECT version FROM _sqlx_migrations WHERE success = 1", ())
        .await
        .map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        applied.insert(row.get::<i64>(0).map_err(|e| e.to_string())?);
    }

    for migration in MIGRATIONS.iter().filter(|m| !applied.contains(&m.version)) {
        let fail = |e: libsql::Error| format!("migration {} failed: {e}", migration.version);
        let tx = conn.transaction().await.map_err(fail)?;
        let applied = async {
            tx.execute_batch(migration.sql).await?;
            tx.execute(
                "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time)
                 VALUES (?1, ?2, 1, x'', 0)",
                params![migration.version, migration.description],
            )
            .await
        }
        .await;
        match applied {
            Ok(_) => tx.commit().await.map_err(fail)?,
            Err(e) => {
                let _ = tx.rollback().await;
                return Err(fail(e));
            }
        }
    }
    Ok(())
}
