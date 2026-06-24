!macro KEYDEX_CLOSE_RUNNING_PROCESSES
  DetailPrint "Closing running Keydex processes in $INSTDIR..."
  nsExec::ExecToLog `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { Get-CimInstance Win32_Process -Filter \"Name='keydex-desktop.exe' OR Name='agent-server.exe'\" | Where-Object { @('$INSTDIR\keydex-desktop.exe', '$INSTDIR\agent-server.exe') -contains $$_.ExecutablePath } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue } }"`
  Sleep 800
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro KEYDEX_CLOSE_RUNNING_PROCESSES
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro KEYDEX_CLOSE_RUNNING_PROCESSES
!macroend
