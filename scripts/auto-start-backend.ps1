$projectRoot = Split-Path -Parent $PSScriptRoot
$backendScript = Join-Path $PSScriptRoot 'dev-backend.ps1'
$dockerDesktopPath = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
$logDir = Join-Path $env:LOCALAPPDATA 'RedditFeishuBot'
$logFile = Join-Path $logDir 'autostart.log'

function Write-Log {
  param(
    [string]$Message
  )

  if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }

  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $logFile -Value "[$timestamp] $Message"
}

function Test-DockerReady {
  docker info | Out-Null
  return $LASTEXITCODE -eq 0
}

try {
  Write-Log "Auto-start bootstrap begin."
  Set-Location $projectRoot

  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'docker command not found.'
  }

  if (-not (Test-DockerReady)) {
    if (-not (Test-Path $dockerDesktopPath)) {
      throw "Docker Desktop not found at $dockerDesktopPath"
    }

    Write-Log 'Launching Docker Desktop.'
    Start-Process -FilePath $dockerDesktopPath -WindowStyle Hidden

    $deadline = (Get-Date).AddMinutes(3)
    while ((Get-Date) -lt $deadline) {
      if (Test-DockerReady) {
        Write-Log 'Docker Desktop is ready.'
        break
      }

      Start-Sleep -Seconds 3
    }

    if (-not (Test-DockerReady)) {
      throw 'Docker Desktop did not become ready within 3 minutes.'
    }
  } else {
    Write-Log 'Docker Desktop already ready.'
  }

  Write-Log 'Starting backend bootstrap script.'
  Start-Process `
    -FilePath 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' `
    -ArgumentList @(
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-WindowStyle', 'Hidden',
      '-File', $backendScript
    ) `
    -WindowStyle Hidden

  Write-Log 'Backend bootstrap launched.'
} catch {
  Write-Log "Auto-start failed: $($_.Exception.Message)"
  throw
}
