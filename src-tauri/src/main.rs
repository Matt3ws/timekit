// Prevents additional console window on Windows in every bundled build (also
// `tauri build --debug`); only `tauri dev` (cfg `dev`) keeps the console for logs.
// DO NOT REMOVE!!
#![cfg_attr(not(dev), windows_subsystem = "windows")]

fn main() {
    timekit_lib::run()
}
