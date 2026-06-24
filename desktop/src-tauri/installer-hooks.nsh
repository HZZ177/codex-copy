!macro KEYDEX_CLOSE_RUNNING_PROCESSES
  DetailPrint "Checking running Keydex processes in $INSTDIR..."
  nsExec::ExecToLog `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { $$installDir = '$INSTDIR'; $$targets = @((Join-Path $$installDir 'keydex-desktop.exe'), (Join-Path $$installDir 'agent-server.exe')); $$filter = \"Name='keydex-desktop.exe' OR Name='agent-server.exe'\"; $$getTargets = { @(Get-CimInstance Win32_Process -Filter $$filter | Where-Object { $$_.ExecutablePath -and ($$targets -contains $$_.ExecutablePath) }) }; $$processes = & $$getTargets; if ($$processes.Count -eq 0) { Write-Output \"No running Keydex processes found in $$installDir.\"; exit 0 }; Write-Output \"Found $$($$processes.Count) running Keydex process(es) in $$installDir.\"; $$taskkill = Join-Path $$env:SystemRoot 'System32\taskkill.exe'; foreach ($$process in $$processes) { $$current = Get-Process -Id $$process.ProcessId -ErrorAction SilentlyContinue; if (-not $$current) { Write-Output \"Already stopped: $$($$process.Name) pid=$$($$process.ProcessId)\"; continue }; Write-Output \"Closing $$($$process.Name) pid=$$($$process.ProcessId) path=$$($$process.ExecutablePath)\"; & $$taskkill /PID $$process.ProcessId /T /F 2>&1 | ForEach-Object { Write-Output \"taskkill: $$_\" } }; Start-Sleep -Milliseconds 800; $$remaining = & $$getTargets; if ($$remaining.Count -gt 0) { Write-Output \"Failed to close $$($$remaining.Count) Keydex process(es):\"; $$remaining | ForEach-Object { Write-Output \"Remaining $$($$_.Name) pid=$$($$_.ProcessId) path=$$($$_.ExecutablePath)\" }; exit 1 }; Write-Output \"Closed all running Keydex processes in $$installDir.\"; exit 0 }"`
  Pop $0
  StrCmp $0 "0" +2 0
  DetailPrint "Keydex process cleanup returned $0."
  Sleep 800
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro KEYDEX_CLOSE_RUNNING_PROCESSES
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro KEYDEX_CLOSE_RUNNING_PROCESSES
!macroend
