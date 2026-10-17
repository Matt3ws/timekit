//! Windows: make the taskbar button show TimeKit's icon.
//!
//! - tao only sets the window's small icon (`ICON_SMALL`, the title bar), so
//!   `apply` also sets `ICON_BIG` from the icon embedded in the exe.
//! - Started from a shortcut, the taskbar takes the button's icon from that
//!   shortcut instead of the window. Explorer reads it out of the exe, which
//!   Smart App Control stops for an unsigned exe, leaving a generic icon.
//!   `set_app_id` gives the process its own AppUserModelID, which no shortcut
//!   carries, so the taskbar uses the window's icon however TimeKit started.

use std::os::windows::ffi::OsStrExt;

use windows_sys::Win32::UI::Shell::{SHDefExtractIconW, SetCurrentProcessExplicitAppUserModelID};
use windows_sys::Win32::UI::WindowsAndMessaging::{SendMessageW, HICON, ICON_BIG, WM_SETICON};

/// Not the bundle identifier: the installer's shortcuts may carry that one.
const APP_ID: &str = "TimeKit.App";

/// Largest size Windows uses for a taskbar button; it scales down from here.
const SIZE: u32 = 256;

/// Call before any window exists.
pub fn set_app_id() {
    let id: Vec<u16> = APP_ID.encode_utf16().chain(Some(0)).collect();
    unsafe { SetCurrentProcessExplicitAppUserModelID(id.as_ptr()) };
}

pub fn apply(window: &tauri::WebviewWindow) {
    let (Ok(exe), Ok(hwnd)) = (std::env::current_exe(), window.hwnd()) else {
        return;
    };
    let path: Vec<u16> = exe.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut icon: HICON = std::ptr::null_mut();
    // Low word: large icon size. The small icon isn't needed (null).
    let result = unsafe { SHDefExtractIconW(path.as_ptr(), 0, 0, &mut icon, std::ptr::null_mut(), SIZE) };
    if result == 0 && !icon.is_null() {
        // The window keeps the icon for its lifetime; it is never destroyed.
        unsafe { SendMessageW(hwnd.0 as _, WM_SETICON, ICON_BIG as usize, icon as isize) };
    }
}
