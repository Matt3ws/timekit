//! Turso sync settings and status.
//!
//! The URL and token live in `sync.json` next to the database, not in the
//! database itself (the database can't be opened without them). Changing
//! them reopens the database in place (`DbState::reopen`).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::db::{DbState, Mode};

const FILE: &str = "sync.json";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConfig {
    pub url: String,
    pub auth_token: String,
}

/// The folder holding the database files and `sync.json`.
pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// The saved settings, or `None` when sync is off.
pub fn load(dir: &Path) -> Result<Option<SyncConfig>, String> {
    let path = dir.join(FILE);
    if !path.exists() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text)
        .map(Some)
        .map_err(|e| format!("{FILE} is invalid: {e}"))
}

/// What the Settings page shows.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    mode: Mode,
    /// The Turso database URL while sync is on (the token is never sent back).
    url: Option<String>,
    /// Why sync is offline, or why the database couldn't be opened.
    message: Option<String>,
}

#[tauri::command]
pub async fn sync_status(app: AppHandle, state: State<'_, DbState>) -> Result<SyncStatus, String> {
    let url = load(&data_dir(&app)?)?.map(|config| config.url);
    let (mode, message) = state.status().await;
    Ok(SyncStatus { mode, url, message })
}

/// Pulls the latest changes from Turso now (a no-op unless sync is on).
#[tauri::command]
pub async fn sync_now(state: State<'_, DbState>) -> Result<(), String> {
    state.sync().await
}

/// Checks that the database answers, saves the settings and switches to the
/// Turso replica. If the switch doesn't come up synced, sync is turned off
/// again (back on the local file) and the reason is returned.
#[tauri::command]
pub async fn save_sync_config(
    app: AppHandle,
    state: State<'_, DbState>,
    url: String,
    auth_token: String,
) -> Result<(), String> {
    let url = url.trim().to_string();
    let auth_token = auth_token.trim().to_string();
    check_connection(&url, &auth_token).await?;

    let config = SyncConfig { url, auth_token };
    let text = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    let path = data_dir(&app)?.join(FILE);
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    state.reopen(&app).await;

    if let (Mode::Synced, _) = state.status().await {
        return Ok(());
    }
    let (_, message) = state.status().await;
    std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    state.reopen(&app).await;
    Err(message.unwrap_or_else(|| "Couldn't switch to the Turso database".into()))
}

/// Turns sync off: back to this computer's local database file.
#[tauri::command]
pub async fn clear_sync_config(app: AppHandle, state: State<'_, DbState>) -> Result<(), String> {
    let path = data_dir(&app)?.join(FILE);
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    state.reopen(&app).await;
    Ok(())
}

/// Opens the database again, e.g. to reconnect to Turso after being offline.
#[tauri::command]
pub async fn reconnect(app: AppHandle, state: State<'_, DbState>) -> Result<(), String> {
    state.reopen(&app).await;
    Ok(())
}

async fn check_connection(url: &str, auth_token: &str) -> Result<(), String> {
    let fail = |e: libsql::Error| format!("Couldn't connect to Turso: {e}");
    let db = libsql::Builder::new_remote(url.to_string(), auth_token.to_string())
        .build()
        .await
        .map_err(fail)?;
    let conn = db.connect().map_err(fail)?;
    conn.query("SELECT 1", ()).await.map_err(fail)?;
    Ok(())
}
