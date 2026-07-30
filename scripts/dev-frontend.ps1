$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host "Starting frontend from $projectRoot" -ForegroundColor Cyan
bun run --cwd apps/frontend dev
