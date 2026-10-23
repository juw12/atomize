param([Parameter(Mandatory=$true)][ValidateSet('start','stop','restart','status','toggle')][string]$Action)

$ErrorActionPreference = 'Continue'
$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidfile    = Join-Path $scriptDir 'daemon.pid'
$stopFlag   = Join-Path $scriptDir 'daemon.stop'
$taskName   = 'Outlook Archiver'

function Get-DaemonPid {
    if (-not (Test-Path -LiteralPath $pidfile)) { return $null }
    $raw = Get-Content $pidfile -ErrorAction SilentlyContinue
    if (-not $raw) { return $null }
    return $raw.Trim()
}

function Test-DaemonAlive {
    $dp = Get-DaemonPid
    if ($dp -and (Get-Process -Id $dp -ErrorAction SilentlyContinue)) { return $dp }
    return $null
}

function Remove-Pidfile {
    if (Test-Path -LiteralPath $pidfile) {
        Remove-Item -LiteralPath $pidfile -Force -ErrorAction SilentlyContinue
    }
}

function Remove-StopFlag {
    if (Test-Path -LiteralPath $stopFlag) {
        Remove-Item -LiteralPath $stopFlag -Force -ErrorAction SilentlyContinue
    }
}

function Request-Stop {
    param([int]$TimeoutSec = 10)
    $alive = Test-DaemonAlive
    if (-not $alive) { return $true }
    Set-Content -LiteralPath $stopFlag -Value 'stop' -Encoding ASCII
    for ($i = 0; $i -lt $TimeoutSec; $i++) {
        Start-Sleep -Seconds 1
        if (-not (Test-DaemonAlive)) { return $true }
    }
    Write-Warning "daemon did not stop within ${TimeoutSec}s; forcing TerminateProcess"
    Stop-Process -Id $alive -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    return (-not (Test-DaemonAlive))
}

switch ($Action) {
    'status' {
        $alive = Test-DaemonAlive
        if ($alive) {
            Write-Host ("Running (pid {0})." -f $alive) -ForegroundColor Green
        } else {
            Write-Host 'Not running.' -ForegroundColor Yellow
        }
        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        if ($task) {
            Write-Host ("Task state: {0}" -f $task.State)
        }
    }
    'start' {
        $alive = Test-DaemonAlive
        if ($alive) {
            Write-Host ("Daemon already running (pid {0})." -f $alive) -ForegroundColor Yellow
            exit 1
        }
        Remove-Pidfile
        Write-Host 'Starting daemon via Task Scheduler...'
        Start-ScheduledTask -TaskName $taskName | Out-Null
        Start-Sleep -Seconds 4
        $newPid = Test-DaemonAlive
        if ($newPid) {
            Write-Host ("Daemon started (pid {0})." -f $newPid) -ForegroundColor Green
        } else {
            Write-Host 'Daemon may have failed. Check log.' -ForegroundColor Red
        }
    }
    'stop' {
        if (-not (Test-Path -LiteralPath $pidfile)) {
            Write-Host 'Daemon not running (no pidfile).' -ForegroundColor Yellow
            exit 0
        }
        $dp = Get-DaemonPid
        if (-not $dp) {
            Remove-Pidfile
            Write-Host 'Empty pidfile; cleaned up.' -ForegroundColor Yellow
            exit 0
        }
        $alive = Test-DaemonAlive
        if ($alive) {
            Write-Host ("Stopping daemon (pid {0})..." -f $alive) -ForegroundColor Cyan
            if (Request-Stop -TimeoutSec 10) {
                Write-Host 'Stopped.' -ForegroundColor Green
            } else {
                Write-Host 'Forced kill.' -ForegroundColor Red
            }
        } else {
            Write-Host 'Stale pidfile (process gone); cleaned up.' -ForegroundColor Yellow
        }
        Remove-Pidfile
        Remove-StopFlag
    }
    'toggle' {
        $alive = Test-DaemonAlive
        if ($alive) {
            Write-Host ("Daemon is running (pid {0}). Stopping..." -f $alive) -ForegroundColor Yellow
            if (Request-Stop -TimeoutSec 10) {
                Write-Host 'Stopped.' -ForegroundColor Green
            } else {
                Write-Host 'Forced kill.' -ForegroundColor Red
            }
            Remove-Pidfile
            Remove-StopFlag
        } else {
            Write-Host 'Daemon is stopped. Starting...' -ForegroundColor Yellow
            Remove-Pidfile
            Remove-StopFlag
            Start-ScheduledTask -TaskName $taskName | Out-Null
            Start-Sleep -Seconds 4
            $newPid = Test-DaemonAlive
            if ($newPid) {
                Write-Host ("Started (pid {0})." -f $newPid) -ForegroundColor Green
            } else {
                Write-Host 'Failed to start. Check log.' -ForegroundColor Red
            }
        }
    }
    'restart' {
        Write-Host 'Stopping daemon...'
        $alive = Test-DaemonAlive
        if ($alive) {
            Request-Stop -TimeoutSec 10 | Out-Null
        }
        Remove-Pidfile
        Remove-StopFlag
        Write-Host 'Waiting 3s for clean exit...'
        Start-Sleep -Seconds 3
        Write-Host 'Starting daemon via Task Scheduler...'
        Start-ScheduledTask -TaskName $taskName | Out-Null
        Start-Sleep -Seconds 4
        $newPid = Test-DaemonAlive
        if ($newPid) {
            Write-Host ("Restarted (pid {0})." -f $newPid) -ForegroundColor Green
        } else {
            Write-Host 'Restart may have failed. Check log.' -ForegroundColor Red
        }
    }
}
