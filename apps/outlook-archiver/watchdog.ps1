$pf = Join-Path $PSScriptRoot 'daemon.pid'  # the daemon writes daemon.pid next to itself
if (Test-Path -LiteralPath $pf) {
    $dp = (Get-Content $pf -ErrorAction SilentlyContinue).Trim()
    if ($dp -and (Get-Process -Id $dp -ErrorAction SilentlyContinue)) {
        # Daemon alive; just slide the 31-day window forward.
        & "$PSScriptRoot\register_task.ps1" | Out-Null
        exit 0
    }
}
# Daemon dead: start it (Outlook Archiver task), then slide the watchdog window.
Start-ScheduledTask -TaskName 'Outlook Archiver' | Out-Null
& "$PSScriptRoot\register_task.ps1" | Out-Null
