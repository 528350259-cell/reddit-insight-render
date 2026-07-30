$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$backendPort = 5002
$mongoPort = 27018
$redisPort = 6378
$dockerComposeFile = Join-Path $projectRoot 'docker-compose.yml'

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
    [int]$TimeoutSeconds = 25
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

function Ensure-DockerReady {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker command not found. Please install Docker Desktop first." -ForegroundColor Red
    exit 1
  }

  docker info | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker Desktop is not ready. Please open Docker Desktop and wait until it is running." -ForegroundColor Red
    exit 1
  }
}

function Ensure-DatabaseServices {
  if (-not (Test-Path $dockerComposeFile)) {
    Write-Host "docker-compose.yml not found in $projectRoot" -ForegroundColor Red
    exit 1
  }

  Write-Host "Starting MongoDB and Redis..." -ForegroundColor Cyan
  docker-compose up -d | Out-Host

  if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to start Docker services." -ForegroundColor Red
    exit $LASTEXITCODE
  }

  $mongoReady = Wait-PortReady -Port $mongoPort -Label 'MongoDB'
  $redisReady = Wait-PortReady -Port $redisPort -Label 'Redis'

  if (-not ($mongoReady -and $redisReady)) {
    Write-Host "Database services are not ready. Please check Docker Desktop." -ForegroundColor Red
    exit 1
  }
}

function Stop-ExistingBackendProcess {
  Write-Host "Checking backend port $backendPort..." -ForegroundColor Cyan

  $existingListeners = Get-NetTCPConnection -LocalPort $backendPort -State Listen -ErrorAction SilentlyContinue
  if (-not $existingListeners) {
    return
  }

  $processIds = $existingListeners | Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($processId in $processIds) {
    try {
      $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction Stop
      $commandLine = $process.CommandLine

      if ($commandLine -match 'Reddit-scraper-main\\apps\\backend' -or $commandLine -match 'nest(.js)? start') {
        Write-Host "Stopping existing backend process on port $backendPort (PID: $processId)..." -ForegroundColor Yellow
        Stop-Process -Id $processId -Force -ErrorAction Stop
      } else {
        Write-Host "Port $backendPort is used by a non-backend process (PID: $processId). Leaving it alone." -ForegroundColor Red
      }
    } catch {
      Write-Host "Could not inspect or stop PID ${processId}: $($_.Exception.Message)" -ForegroundColor Red
    }
  }

  Start-Sleep -Seconds 1
}

Ensure-DockerReady
Ensure-DatabaseServices
Stop-ExistingBackendProcess

Write-Host "Starting backend with Feishu long connection from $projectRoot" -ForegroundColor Cyan
bun run --cwd apps/backend start:dev
