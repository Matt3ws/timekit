/**
 * Platform detection for the few places the UI differs between macOS and
 * Windows. On macOS the window is transparent with native vibrancy behind the
 * sidebar and an overlay title bar; on Windows it is a plain opaque window
 * with the native title bar (see `src-tauri/tauri.windows.conf.json`).
 *
 * @module
 */

/** True when running on Windows (WebView2). */
export const isWindows = (): boolean => navigator.userAgent.includes("Windows");

/** Tags `<html>` with `platform-windows` so CSS can swap the macOS-only chrome. */
export const initPlatform = (): void => {
  if (isWindows()) {
    document.documentElement.classList.add("platform-windows");
  }
};
