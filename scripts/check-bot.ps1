$taskName = 'RedditFeishuBackendAutoStart'
$schtasksPath = 'C:\Windows\System32\schtasks.exe'
$logFile = Join-Path $env:LOCALAPPDATA 'RedditFeishuBot\autostart.log'

function Write-Section {
  param(
    [string]$Title
  )

  Write-Host ""
  Write-Host "=== $Title ===" -ForegroundColor Cyan
}

function Get-TaskInfo {
  if (-not (Test-Path $schtasksPath)) {
    return @('schtasks.exe not found.')
  }

  try {
    $lines = & $schtasksPath /Query /TN $taskName /V /FO LIST 2>$null
    if ($LASTEXITCODE -ne 0) {
      return @("Task $taskName not found.")
    }

    return $lines | Where-Object {
      $_ -match '^(TaskName|Status|Last Run Time|Last Result|Task To Run):'
    }
  } catch {
    return @("Failed to read scheduled task: $($_.Exception.Message)")
  }
}

function Test-DockerReady {
  docker info | Out-Null
  return $LASTEXITCODE -eq 0
}

function Get-ListenerInfo {
  param(
    [int]$Port
  )

  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if (-not $listener) {
    return "Port ${Port}: not listening"
  }

  return "Port ${Port}: listening (PID $($listener.OwningProcess))"
}

function Get-HealthStatus {
  param(
    [string]$Name,
    [string]$Url
  )

  try {
    $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 5
    return "${Name}: HTTP $($response.StatusCode)"
  } catch {
    return "${Name}: $($_.Exception.Message)"
  }
}

Write-Section 'Scheduled Task'
Get-TaskInfo | ForEach-Object { Write-Host $_ }

Write-Section 'Docker'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host 'docker command not found.' -ForegroundColor Red
} elseif (Test-DockerReady) {
  Write-Host 'Docker Desktop: ready' -ForegroundColor Green
  docker ps --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}" | Out-Host
} else {
  Write-Host 'Docker Desktop: not ready' -ForegroundColor Red
}

Write-Section 'Ports'
Get-ListenerInfo -Port 27018 | Write-Host
Get-ListenerInfo -Port 6378 | Write-Host
Get-ListenerInfo -Port 5002 | Write-Host

Write-Section 'Backend Health'
Get-HealthStatus -Name 'Settings API' -Url 'http://localhost:5002/settings' | Write-Host
Get-HealthStatus -Name 'Queries API' -Url 'http://localhost:5002/queries' | Write-Host

Write-Section 'Autostart Log'
if (Test-Path $logFile) {
  Get-Content $logFile | Select-Object -Last 20 | ForEach-Object { Write-Host $_ }
} else {
  Write-Host "No autostart log found at $logFile"
}
