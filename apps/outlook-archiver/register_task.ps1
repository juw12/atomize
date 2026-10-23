<#
.SYNOPSIS
    Register all Outlook Archiver Task Scheduler jobs.

.DESCRIPTION
    Creates three tasks:

    1. "Outlook AutoStart" - launches Outlook.exe at user logon so the daemon
       has a mailbox to connect to.

    2. "Outlook Archiver" - runs the daemon (python.exe outlook_archiver.py)
       at user logon. Highly resilient: restarts up to 99 times on failure
       (1-minute interval) so a slow Outlook startup (typical right after a
       laptop reboot) cannot permanently kill the daemon.

       NOTE: The action calls python.exe DIRECTLY (no cmd.exe wrapper). Wrapping
       in cmd.exe /c makes Task Scheduler's Job Object reap the orphaned
       python.exe as soon as cmd.exe exits, which kills the daemon within ~1s.

    3. "Outlook Archiver Watchdog" - polls every 5 minutes. If the daemon is
       not running, it starts it via Start-ScheduledTask. This is the safety
       net for cases where the daemon was stopped cleanly (file-flag stop,
       manual toggle) or exited for any reason.

    Re-running this script overwrites all tasks. Works for the current user.
#>

$ErrorActionPreference = "Stop"

$taskName        = "Outlook Archiver"
$outlookTaskName = "Outlook AutoStart"
$scriptDir       = Join-Path $env:USERPROFILE "outlook_archiver"
$pyScript        = Join-Path $scriptDir "outlook_archiver.py"
$description     = "Auto-archive Outlook Inbox + Sent Items from the live mailbox into the archive PST (current target: D:\Outlook\20261020.pst). Keeps the live mailbox Inbox/Sent Items empty. Auto-marks incoming mail as read."

if (-not (Test-Path -LiteralPath $pyScript)) {
    throw "Cannot find daemon script: $pyScript"
}

# Locate python.exe robustly: try PATH first, then common Windows install paths.
$pythonExe = $null
$pyCmd = Get-Command python.exe -ErrorAction SilentlyContinue
if ($pyCmd) { $pythonExe = $pyCmd.Source }
if (-not $pythonExe) {
    foreach ($c in @(
        "${env:LOCALAPPDATA}\Programs\Python\Python313\python.exe",
        "${env:LOCALAPPDATA}\Programs\Python\Python312\python.exe",
        "${env:LOCALAPPDATA}\Programs\Python\Python311\python.exe",
        "${env:LOCALAPPDATA}\Programs\Python\Python310\python.exe",
        "${env:ProgramFiles}\Python313\python.exe",
        "${env:ProgramFiles}\Python312\python.exe"
    )) {
        if (Test-Path -LiteralPath $c) { $pythonExe = $c; break }
    }
}
if (-not $pythonExe) {
    throw "Cannot locate python.exe in PATH or common install locations."
}

$principal = New-ScheduledTaskPrincipal `
                -UserId    $env:USERNAME `
                -LogonType Interactive `
                -RunLevel  Limited

# --------------------------------------------------
# 1. Outlook AutoStart
# --------------------------------------------------
$outlookExe = $null
foreach ($c in @(
    "${env:ProgramFiles}\Microsoft Office\root\Office16\OUTLOOK.EXE",
    "${env:ProgramFiles(x86)}\Microsoft Office\root\Office16\OUTLOOK.EXE",
    "${env:ProgramFiles}\Microsoft Office\Office16\OUTLOOK.EXE",
    "${env:ProgramFiles(x86)}\Microsoft Office\Office16\OUTLOOK.EXE"
)) {
    if ($c -and (Test-Path -LiteralPath $c)) { $outlookExe = $c; break }
}
if (-not $outlookExe) {
    $cmd = Get-Command outlook.exe -ErrorAction SilentlyContinue
    if ($cmd) { $outlookExe = $cmd.Source }
}

if ($outlookExe) {
    Register-ScheduledTask `
        -TaskName    $outlookTaskName `
        -Action      (New-ScheduledTaskAction -Execute $outlookExe) `
        -Trigger     (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME) `
        -Settings    (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable) `
        -Principal   $principal `
        -Description "Auto-start Outlook at user logon (required by Outlook Archiver)" `
        -Force       | Out-Null
    Write-Host "Registered task: '$outlookTaskName'  ->  $outlookExe"
} else {
    Write-Warning "Could not locate outlook.exe; skipping '$outlookTaskName' task registration."
}

# --------------------------------------------------
# 2. Outlook Archiver (delayed, highly resilient)
# --------------------------------------------------
# Run python.exe DIRECTLY (no cmd.exe wrapper). When the task is launched via
# cmd.exe /c, Task Scheduler assigns the entire process tree to a Job Object;
# once cmd.exe exits, the Job Object is reaped and python.exe is killed.
# Calling python.exe directly avoids that and lets the daemon survive.
$action = New-ScheduledTaskAction `
            -Execute $pythonExe `
            -Argument "outlook_archiver.py" `
            -WorkingDirectory $scriptDir

# Trigger at logon. The daemon has a 5-minute internal Outlook-connect retry
# so it survives Outlook being slow to start even if it fires first.
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# No execution timeout. Restart up to 99x on failure (1-minute interval,
# which is the smallest value Task Scheduler accepts).
$settings = New-ScheduledTaskSettingsSet `
                -AllowStartIfOnBatteries `
                -DontStopIfGoingOnBatteries `
                -DontStopOnIdleEnd `
                -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
                -RestartCount 99 `
                -RestartInterval (New-TimeSpan -Minutes 1) `
                -StartWhenAvailable

Register-ScheduledTask `
    -TaskName    $taskName `
    -Action      $action `
    -Trigger     $trigger `
    -Settings    $settings `
    -Principal   $principal `
    -Description $description `
    -Force       | Out-Null

Write-Host ""
Write-Host "Registered task: '$taskName'"
Write-Host "  Trigger : AtLogOn for $env:USERNAME"
Write-Host "  Action  : $pythonExe outlook_archiver.py"
Write-Host "  Restarts: up to 99, every 1 minute (Outlook can take a few minutes to load)"
Write-Host "  Log file: $env:USERPROFILE\outlook_archive.log"

# --------------------------------------------------
# 3. Watchdog: polls every 5 minutes; restarts daemon if it is not running
# --------------------------------------------------
$pidfile       = Join-Path $scriptDir "daemon.pid"
$watchdogName  = "Outlook Archiver Watchdog"
$watchdogScript = Join-Path $scriptDir "watchdog.ps1"

# Inline PowerShell watchdog. Reads the pidfile, verifies the process is
# alive; if not, kicks Outlook Archiver via Start-ScheduledTask.
# Always re-runs register_task.ps1 to slide the 31-day repetition window
# forward, so the watchdog effectively never expires.
$watchdogPs = @"
`$pf = '$pidfile'
if (Test-Path -LiteralPath `$pf) {
    `$dp = (Get-Content `$pf -ErrorAction SilentlyContinue).Trim()
    if (`$dp -and (Get-Process -Id `$dp -ErrorAction SilentlyContinue)) {
        # Daemon alive; just slide the 31-day window forward.
        & "`$PSScriptRoot\register_task.ps1" | Out-Null
        exit 0
    }
}
# Daemon dead: start it (Outlook Archiver task), then slide the watchdog window.
Start-ScheduledTask -TaskName '$taskName' | Out-Null
& "`$PSScriptRoot\register_task.ps1" | Out-Null
"@
Set-Content -LiteralPath $watchdogScript -Value $watchdogPs -Encoding UTF8 -Force

# Trigger: fires once at registration time, then repeats every 5 minutes
# for 31 days (the practical max RepetitionDuration Task Scheduler accepts
# via the PS 5.1 API). The watchdog re-arms itself every 5 minutes via
# watchdog.ps1 -> register_task.ps1, so the 31-day window slides forward
# and never expires in practice as long as the user logs in at least
# once per month.
$wdTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
                  -RepetitionInterval (New-TimeSpan -Minutes 5) `
                  -RepetitionDuration (New-TimeSpan -Days 31)

# Settings: allow the watchdog to run on battery, restart on failure.
# ExecutionTimeLimit kept short so a stuck powershell.exe doesn't accumulate.
$wdSettings = New-ScheduledTaskSettingsSet `
                  -AllowStartIfOnBatteries `
                  -DontStopIfGoingOnBatteries `
                  -ExecutionTimeLimit (New-TimeSpan -Minutes 1) `
                  -RestartCount 99 `
                  -RestartInterval (New-TimeSpan -Minutes 1) `
                  -StartWhenAvailable

Register-ScheduledTask `
    -TaskName    $watchdogName `
    -Action      (New-ScheduledTaskAction -Execute "powershell.exe" `
                                     -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$watchdogScript`"" `
                                     -WorkingDirectory $scriptDir) `
    -Trigger     $wdTrigger `
    -Settings    $wdSettings `
    -Principal   $principal `
    -Description "Polls every 5 minutes; starts Outlook Archiver daemon if it is not running." `
    -Force       | Out-Null

Write-Host ""
Write-Host "Registered task: '$watchdogName'"
Write-Host "  Trigger : once at registration, then every 5 min for 31 days (sliding window)"
Write-Host "  Action  : powershell.exe $watchdogScript"

Write-Host ""
Write-Host "Start them now (optional):"
Write-Host "  Start-ScheduledTask -TaskName '$outlookTaskName'"
Write-Host "  Start-ScheduledTask -TaskName '$taskName'"
Write-Host "  Start-ScheduledTask -TaskName '$watchdogName'"
Write-Host ""
Write-Host "Remove later:"
Write-Host "  Unregister-ScheduledTask -TaskName '$outlookTaskName' -Confirm:`$false"
Write-Host "  Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
Write-Host "  Unregister-ScheduledTask -TaskName '$watchdogName' -Confirm:`$false"
