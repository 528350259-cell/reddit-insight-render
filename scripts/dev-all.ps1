$projectRoot = Split-Path -Parent $PSScriptRoot
$backendScript = Join-Path $PSScriptRoot 'dev-backend.ps1'
$frontendScript = Join-Path $PSScriptRoot 'dev-frontend.ps1'
$envFile = Join-Path $projectRoot '.env'

function Get-DotEnvValue {
  param(
    [string]$Path,
    [string]$Key
  )

  if (-not (Test-Path $Path)) {
    return $null
  }

  $line = Get-Content $Path | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
  if (-not $line) {
    return $null
  }

  return ($line -replace "^\s*$Key\s*=\s*", '').Trim()
}

function Test-PortReady {
  param(
    [int]$Port
  )

  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return $null -ne $listeners
}

function Wait-PortReady {
  param(
    [int]$Port,
    [string]$Label,
    [int]$TimeoutSeconds = 20
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    if (Test-PortReady -Port $Port) {
      Write-Host "$Label is ready on port $Port." -ForegroundColor Green
      return $true
    }

    Start-Sleep -Milliseconds 500
  }

  Write-Host "Timed out waiting for $Label on port $Port." -ForegroundColor Red
  return $false
}

Set-Location $projectRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "Docker command not found. Please start Docker Desktop first." -ForegroundColor Red
  exit 1
}

if (-not (Get-Command wt -ErrorAction SilentlyContinue)) {
  Write-Host "Windows Terminal (wt) not found. Please run the backend/frontend scripts manually." -ForegroundColor Red
  exit 1
}

Write-Host "Starting MongoDB and Redis..." -ForegroundColor Cyan
docker-compose up -d

if ($LASTEXITCODE -ne 0) {
  Write-Host "Failed to start Docker services." -ForegroundColor Red
  exit $LASTEXITCODE
}

$mongoReady = Wait-PortReady -Port 27018 -Label 'MongoDB'
$redisReady = Wait-PortReady -Port 6378 -Label 'Redis'

if (-not ($mongoReady -and $redisReady)) {
  Write-Host "Database services are not ready. Please check Docker Desktop." -ForegroundColor Red
  exit 1
}

$feishuEnabledValue = Get-DotEnvValue -Path $envFile -Key 'FEISHU_ENABLED'
$feishuEnabled = $feishuEnabledValue -eq 'true'

Write-Host "Opening backend and frontend tabs..." -ForegroundColor Cyan

if ($feishuEnabled) {
  Write-Host "Feishu integration enabled. Backend will keep the SDK long connection alive directly." -ForegroundColor Cyan
}

wt `
  -w 0 `
  new-tab --title "reddit-backend" powershell -NoExit -ExecutionPolicy Bypass -File $backendScript `
  ';' `
  new-tab --title "reddit-frontend" powershell -NoExit -ExecutionPolicy Bypass -File $frontendScript

exit $LASTEXITCODE
