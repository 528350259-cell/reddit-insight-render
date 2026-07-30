$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host "Starting Feishu long-connection consumer from $projectRoot" -ForegroundColor Cyan
node ".\scripts\feishu-consumer.mjs"
