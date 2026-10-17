//! The database, opened at startup and reopened when sync is switched.
//!
//! - **Local** (sync off): the plain SQLite file `timekit.db`, as always.
//! - **Synced**: a Turso embedded replica, `timekit-sync.db`. Reads hit the
//!   local copy; writes go to the shared Turso database, then come back down.
//!   Every machine writes to the same primary, so there are no conflicts.
//! - **Offline**: sync is on but Turso couldn't be reached when opening. The
//!   replica is opened read-only, so everything can be looked at but nothing
//!   changed until it reconnects (Settings → Sync → Try again).
//!
//! All access goes through one connection behind a mutex: a batch's
//! transaction can never interleave with another command's statements.

use std::path::Path;
use std::time::Duration;

use libsql::{params_from_iter, Builder, Connection, Database, OpenFlags, Value};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use tauri::{AppHandle, State};
use tokio::sync::Mutex;

use crate::{migrate, sync_config};

const LOCAL_FILE: &str = "timekit.db";
const REPLICA_FILE: &str = "timekit-sync.db";
/// How often the replica pulls changes made on the other machine.
const SYNC_INTERVAL: Duration = Duration::from_secs(15);
/// How long startup waits for Turso before falling back to read-only.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

const OFFLINE_WRITE: &str =
    "You're offline. Changes need an internet connection while sync is on: use Try again under Settings → Sync when you're back online.";

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Local,
    Synced,
    Offline,
}

struct Open {
    db: Database,
    conn: Connection,
    mode: Mode,
    /// Why the database is offline.
    note: Option<String>,
}

/// Managed state: the open database, or why it couldn't be opened.
pub struct DbState(Mutex<Result<Open, String>>);

impl DbState {
    pub async fn open(app: &AppHandle) -> Self {
        // Boxed: the replica's future is large; keep it off the stack.
        let open = Box::pin(open(app)).await;
        if let Err(error) = &open {
            eprintln!("[db] {error}");
        }
        Self(Mutex::new(open))
    }

    /// Closes the database and opens it again from the current `sync.json`
    /// (sync turned on/off, or reconnecting after being offline). Holds the
    /// lock throughout, so no command runs against a half-switched database.
    pub async fn reopen(&self, app: &AppHandle) {
        let mut guard = self.0.lock().await;
        // Close the old database first: the local file may be opened again.
        *guard = Err("The database is being reopened".into());
        *guard = Box::pin(open(app)).await;
        if let Err(error) = &*guard {
            eprintln!("[db] {error}");
        }
    }

    pub async fn status(&self) -> (Mode, Option<String>) {
        match &*self.0.lock().await {
            Ok(open) => (open.mode, open.note.clone()),
            Err(error) => (Mode::Offline, Some(error.clone())),
        }
    }

    pub async fn sync(&self) -> Result<(), String> {
        let guard = self.0.lock().await;
        let open = guard.as_ref().map_err(Clone::clone)?;
        if let Mode::Synced = open.mode {
            open.db.sync().await.map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

async fn open(app: &AppHandle) -> Result<Open, String> {
    let dir = sync_config::data_dir(app)?;
    let Some(config) = sync_config::load(&dir)? else {
        let db = Builder::new_local(dir.join(LOCAL_FILE))
            .build()
            .await
            .map_err(|e| e.to_string())?;
        let conn = connect(&db).await?;
        migrate::run(&conn).await?;
        return Ok(Open { db, conn, mode: Mode::Local, note: None });
    };

    let replica = dir.join(REPLICA_FILE);
    let reached = tokio::time::timeout(CONNECT_TIMEOUT, async {
        let db = Builder::new_remote_replica(&replica, config.url, config.auth_token)
            .sync_interval(SYNC_INTERVAL)
            .read_your_writes(true)
            .build()
            .await
            .map_err(|e| e.to_string())?;
        db.sync().await.map_err(|e| e.to_string())?;
        Ok::<_, String>(db)
    })
    .await;

    match reached {
        Ok(Ok(db)) => {
            let conn = connect(&db).await?;
            migrate::run(&conn).await?;
            Ok(Open { db, conn, mode: Mode::Synced, note: None })
        }
        Ok(Err(error)) => open_offline(&replica, error).await,
        Err(_) => open_offline(&replica, "Turso didn't answer within 10 seconds".into()).await,
    }
}

async fn open_offline(replica: &Path, reason: String) -> Result<Open, String> {
    if !replica.exists() {
        return Err(format!("Can't reach Turso, and this computer has no copy of the data yet: {reason}"));
    }
    let db = Builder::new_local(replica)
        .flags(OpenFlags::SQLITE_OPEN_READ_ONLY)
        .build()
        .await
        .map_err(|e| e.to_string())?;
    let conn = db.connect().map_err(|e| e.to_string())?;
    Ok(Open { db, conn, mode: Mode::Offline, note: Some(reason) })
}

/// One connection with the settings the old plugin (sqlx) applied.
async fn connect(db: &Database) -> Result<Connection, String> {
    let conn = db.connect().map_err(|e| e.to_string())?;
    // Billed entries rely on FK RESTRICT; SQLite leaves it off by default.
    conn.execute("PRAGMA foreign_keys = ON", ()).await.map_err(|e| e.to_string())?;
    Ok(conn)
}

fn friendly(error: libsql::Error) -> String {
    let text = error.to_string();
    if text.contains("readonly") {
        return OFFLINE_WRITE.to_string();
    }
    // Errors from Turso arrive wrapped in protocol noise:
    // Hrana: `stream error: `Error { message: "SQLite error: …", code: … }``
    if let Some(start) = text.find("message: \"") {
        let rest = &text[start + "message: \"".len()..];
        if let Some(end) = rest.find('"') {
            return rest[..end].trim_start_matches("SQLite error: ").to_string();
        }
    }
    text
}

fn to_value(json: JsonValue) -> Value {
    match json {
        JsonValue::Null => Value::Null,
        JsonValue::Bool(flag) => Value::Integer(flag.into()),
        JsonValue::Number(number) => match number.as_i64() {
            Some(integer) => Value::Integer(integer),
            None => Value::Real(number.as_f64().unwrap_or_default()),
        },
        JsonValue::String(text) => Value::Text(text),
        other => Value::Text(other.to_string()),
    }
}

fn to_json(value: Value) -> JsonValue {
    match value {
        Value::Null => JsonValue::Null,
        Value::Integer(integer) => integer.into(),
        Value::Real(real) => serde_json::Number::from_f64(real).map_or(JsonValue::Null, JsonValue::Number),
        Value::Text(text) => text.into(),
        Value::Blob(bytes) => bytes.into(),
    }
}

async fn query_rows(conn: &Connection, sql: &str, params: Vec<Value>) -> Result<Vec<Vec<Value>>, libsql::Error> {
    let mut rows = conn.query(sql, params_from_iter(params)).await?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().await? {
        let values = (0..row.column_count())
            .map(|index| row.get_value(index))
            .collect::<Result<Vec<_>, _>>()?;
        out.push(values);
    }
    Ok(out)
}

/// Runs one statement as Drizzle renders it. `run` returns no rows; every
/// other method (including `.returning()`) returns the rows as arrays.
#[tauri::command]
pub async fn db_query(
    state: State<'_, DbState>,
    sql: String,
    params: Vec<JsonValue>,
    method: String,
) -> Result<Vec<Vec<JsonValue>>, String> {
    let guard = state.0.lock().await;
    let open = guard.as_ref().map_err(Clone::clone)?;
    let params = params.into_iter().map(to_value).collect::<Vec<_>>();

    if method == "run" {
        open.conn.execute(&sql, params_from_iter(params)).await.map_err(friendly)?;
        return Ok(Vec::new());
    }
    let rows = query_rows(&open.conn, &sql, params).await.map_err(friendly)?;
    Ok(rows
        .into_iter()
        .map(|row| row.into_iter().map(to_json).collect())
        .collect())
}

/// One parameterised statement, as Drizzle renders it in the WebView.
#[derive(Deserialize)]
pub struct BatchStatement {
    sql: String,
    params: Vec<JsonValue>,
}

/// Runs `statements` in a single transaction: every statement commits, or
/// none does. Write statements only: nothing is returned.
#[tauri::command]
pub async fn db_batch(state: State<'_, DbState>, statements: Vec<BatchStatement>) -> Result<(), String> {
    let guard = state.0.lock().await;
    let open = guard.as_ref().map_err(Clone::clone)?;

    let tx = open.conn.transaction().await.map_err(friendly)?;
    for statement in statements {
        let params = statement.params.into_iter().map(to_value);
        if let Err(error) = tx.execute(&statement.sql, params_from_iter(params)).await {
            let _ = tx.rollback().await;
            return Err(friendly(error));
        }
    }
    tx.commit().await.map_err(friendly)
}

/// Writes a full copy of the database to `target` (a new file): the schema,
/// then every row. Works the same on a local file, a replica and offline,
/// and never sends anything to Turso.
#[tauri::command]
pub async fn db_backup(state: State<'_, DbState>, target: String) -> Result<(), String> {
    if Path::new(&target).exists() {
        return Err(format!("{target} already exists"));
    }
    let guard = state.0.lock().await;
    let open = guard.as_ref().map_err(Clone::clone)?;
    copy_database(&open.conn, &target).await.map_err(|e| e.to_string())
}

async fn copy_database(source: &Connection, target: &str) -> Result<(), libsql::Error> {
    let schema = query_rows(
        source,
        "SELECT type, name, sql FROM sqlite_master
         WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'libsql_%'
         ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END",
        Vec::new(),
    )
    .await?;

    let out = Builder::new_local(target).build().await?.connect()?;
    out.execute("BEGIN", ()).await?;
    // Tables first, filled with rows; then indexes, triggers and views.
    for entry in &schema {
        let (Value::Text(kind), Value::Text(name), Value::Text(sql)) = (&entry[0], &entry[1], &entry[2]) else {
            continue;
        };
        out.execute(sql, ()).await?;
        if kind != "table" {
            continue;
        }
        let quoted = name.replace('"', "\"\"");
        let rows = query_rows(source, &format!("SELECT * FROM \"{quoted}\""), Vec::new()).await?;
        for row in rows {
            let placeholders = vec!["?"; row.len()].join(", ");
            out.execute(&format!("INSERT INTO \"{quoted}\" VALUES ({placeholders})"), params_from_iter(row))
                .await?;
        }
    }
    out.execute("COMMIT", ()).await?;
    Ok(())
}
