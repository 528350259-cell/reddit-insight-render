$taskName = 'RedditFeishuBackendAutoStart'
$scriptPath = Join-Path $PSScriptRoot 'run-autostart-backend.cmd'
$schtasksPath = 'C:\Windows\System32\schtasks.exe'

if (-not (Test-Path $scriptPath)) {
  Write-Host "Autostart script not found: $scriptPath" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $schtasksPath)) {
  Write-Host "schtasks.exe not found." -ForegroundColor Red
  exit 1
}

$taskCommand = "`"$scriptPath`""

& $schtasksPath /Create /F /SC ONLOGON /RL HIGHEST /TN $taskName /TR $taskCommand | Out-Host

if ($LASTEXITCODE -ne 0) {
  Write-Host "Failed to create scheduled task $taskName." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "Scheduled task $taskName created successfully." -ForegroundColor Green
Write-Host "It will auto-start Docker Desktop (if needed) and then launch the Reddit Feishu backend at login." -ForegroundColor Cyan
