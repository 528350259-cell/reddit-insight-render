$projectRoot = Split-Path -Parent $PSScriptRoot
$backendScript = Join-Path $PSScriptRoot 'dev-backend.ps1'
$frontendScript = Join-Path $PSScriptRoot 'dev-frontend.ps1'

Write-Host "Tip: use dev-all.ps1 if you want Docker services started automatically." -ForegroundColor DarkGray

if (Get-Command wt -ErrorAction SilentlyContinue) {
  wt `
    -w 0 `
    new-tab --title "reddit-backend" powershell -NoExit -ExecutionPolicy Bypass -File $backendScript `
    ';' `
    new-tab --title "reddit-frontend" powershell -NoExit -ExecutionPolicy Bypass -File $frontendScript
  exit $LASTEXITCODE
}

Write-Host "Windows Terminal (wt) not found. Run these commands manually:" -ForegroundColor Yellow
Write-Host "powershell -ExecutionPolicy Bypass -File `"$backendScript`"" -ForegroundColor Yellow
Write-Host "powershell -ExecutionPolicy Bypass -File `"$frontendScript`"" -ForegroundColor Yellow
