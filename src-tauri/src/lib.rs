mod db;
mod migrate;
mod sync_config;
#[cfg(windows)]
mod taskbar_icon;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(windows)]
    taskbar_icon::set_app_id();

    tauri::Builder::default()
        // Must be the first plugin: a second launch exits right here and
        // brings the running window to the front instead.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Open (and migrate) the database before the window loads, so the
            // first query never races the setup. Opening a Turso replica is a
            // deep future: run it on a runtime worker thread, not the main
            // thread, whose 1 MB stack on Windows overflows.
            let handle = app.handle().clone();
            let state = tauri::async_runtime::block_on(tauri::async_runtime::spawn(async move {
                db::DbState::open(&handle).await
            }))?;
            app.manage(state);

            #[cfg(windows)]
            if let Some(window) = app.get_webview_window("main") {
                taskbar_icon::apply(&window);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::db_query,
            db::db_batch,
            db::db_backup,
            sync_config::sync_status,
            sync_config::sync_now,
            sync_config::save_sync_config,
            sync_config::clear_sync_config,
            sync_config::reconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
