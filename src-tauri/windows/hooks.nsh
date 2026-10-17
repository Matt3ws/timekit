; TimeKit installer hooks (bundle.windows.nsis.installerHooks).
;
; Point the shortcuts' icon at the plain icon.ico installed next to the exe,
; instead of the icon inside the exe. With Smart App Control on, Explorer
; can't read the icon out of an unsigned exe, so the shortcuts, and the
; taskbar button of an app started from one, showed a generic icon.
;
; The recreated shortcuts deliberately have no AppUserModelID (the template
; sets one). With an ID, the taskbar looks the icon up by that ID and showed a
; blank document; the ID only matters for toast notifications, which TimeKit
; doesn't use.
;
; Runs after the template created the shortcuts. A desktop shortcut made from
; the finish page's checkbox is created later and keeps the exe's icon.

!macro TIMEKIT_SHORTCUT_ICON LNK
  ${If} ${FileExists} "${LNK}"
    CreateShortcut "${LNK}" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\icon.ico" 0
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; The template may put the Start menu shortcut in a folder or at the top
  ; level (silent installs do the latter even with a folder set): try both.
  !insertmacro TIMEKIT_SHORTCUT_ICON "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  ${If} $AppStartMenuFolder != ""
    !insertmacro TIMEKIT_SHORTCUT_ICON "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
  ${EndIf}
  !insertmacro TIMEKIT_SHORTCUT_ICON "$DESKTOP\${PRODUCTNAME}.lnk"
!macroend
