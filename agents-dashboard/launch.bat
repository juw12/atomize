@echo off
REM ============================================================
REM  Virtual Bots Office - one-click launcher
REM  Starts the bridge server (which also starts `opencode serve`)
REM  and opens the dashboard in your browser.
REM ============================================================
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python 3 was not found on PATH.
  echo Install Python 3, or edit this file to point at python.exe.
  pause
  exit /b 1
)

echo Starting Virtual Bots Office bridge on http://127.0.0.1:8790/ ...
echo (The first launch also starts `opencode serve`; this can take ~15-40s.)
echo Keep this window open while you use the dashboard. Press Ctrl+C here to stop.
echo.

REM Start the bridge in this window (so Ctrl+C cleanly stops it + opencode serve).
start "" /b python "%~dp0server.py"
timeout /t 3 /nobreak >nul

REM Open the dashboard (it health-checks the bridge and shows live/sim/offline).
start "" "http://127.0.0.1:8790/"

echo Dashboard opened. This window is the bridge log.
endlocal
