$taskName = 'RedditFeishuBackendAutoStart'
$schtasksPath = 'C:\Windows\System32\schtasks.exe'

if (-not (Test-Path $schtasksPath)) {
  Write-Host "schtasks.exe not found." -ForegroundColor Red
  exit 1
}

& $schtasksPath /Delete /F /TN $taskName | Out-Host

if ($LASTEXITCODE -ne 0) {
  Write-Host "Failed to delete scheduled task $taskName." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "Scheduled task $taskName deleted successfully." -ForegroundColor Green
