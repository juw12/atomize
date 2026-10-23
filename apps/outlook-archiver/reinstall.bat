@echo off
REM ============================================================
REM  Outlook Archiver - Reinstall (failsafe)
REM
REM  Re-runs register_task.ps1 to (re-)create:
REM    * "Outlook AutoStart"  - launches Outlook at logon
REM    * "Outlook Archiver"   - launches the daemon at logon
REM  ...then starts both tasks immediately.
REM
REM  Safe to run any time. Overwrites existing tasks.
REM  No admin required (runs in the user's context).
REM ============================================================

title Outlook Archiver - Reinstall

cd /d "%~dp0"

echo.
echo  Re-registering Task Scheduler entries...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0register_task.ps1"
if errorlevel 1 (
    echo.
    echo  ERROR: registration failed. See output above.
    echo.
    pause
    exit /b 1
)

echo.
echo  Starting both tasks now...
echo.
powershell -NoProfile -Command "Start-ScheduledTask -TaskName 'Outlook AutoStart' | Out-Null"
powershell -NoProfile -Command "Start-ScheduledTask -TaskName 'Outlook Archiver'  | Out-Null"

echo.
echo  ============================================================
echo   Outlook Archiver is reinstalled and running.
echo   You can close this window; the daemon will keep running.
echo  ============================================================
echo.
pause
