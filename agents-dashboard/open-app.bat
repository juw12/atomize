@echo off
REM ============================================================
REM  Virtual Bots Office - app launcher
REM  1) Ensures the bridge is listening on 127.0.0.1:8790
REM     (starts start-hidden.vbs if it is not).
REM  2) Opens the dashboard as a chromeless "app window" using
REM     Edge, then Chrome, then the default browser as fallback.
REM  Double-clicked from the desktop shortcut. No installs.
REM ============================================================
setlocal EnableExtensions

set "APPDIR=%~dp0"
set "URL=http://127.0.0.1:8790/"
set "PORT=8790"

REM --- Common install locations (captured first; ")" in names is safe here) ---
set "PF=%ProgramFiles%"
set "PF86=%ProgramFiles(x86)%"
set "LAD=%LocalAppData%"

REM ------------------------------------------------------------
REM  1) Ensure the bridge is running (is TCP port 8790 listening?)
REM ------------------------------------------------------------
set "LISTENING=0"
for /f "usebackq delims=" %%L in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-NetTCPConnection -State Listen -LocalPort %PORT% -ErrorAction SilentlyContinue | Measure-Object).Count"`) do set "LISTENING=%%L"
if not defined LISTENING set "LISTENING=0"

if "%LISTENING%"=="0" (
  wscript.exe "%APPDIR%start-hidden.vbs"
  REM ~4s wait. Uses ping (not timeout) because timeout needs a console stdin
  REM and fails when the .bat is invoked with redirected input.
  ping -n 5 127.0.0.1 >nul
)

REM ------------------------------------------------------------
REM  2) Locate a Chromium browser for the --app window
REM ------------------------------------------------------------
set "BROWSER="

if not defined BROWSER if exist "%PF86%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%PF86%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%PF%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%PF%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%LAD%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%LAD%\Microsoft\Edge\Application\msedge.exe"

if not defined BROWSER if exist "%PF%\Google\Chrome\Application\chrome.exe" set "BROWSER=%PF%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%PF86%\Google\Chrome\Application\chrome.exe" set "BROWSER=%PF86%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LAD%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LAD%\Google\Chrome\Application\chrome.exe"

REM Last resort: ask the system for it.
if not defined BROWSER for /f "delims=" %%B in ('where msedge 2^>nul') do if not defined BROWSER set "BROWSER=%%B"
if not defined BROWSER for /f "delims=" %%B in ('where chrome 2^>nul') do if not defined BROWSER set "BROWSER=%%B"

REM ------------------------------------------------------------
REM  3) Open as an app window (detached, so no console lingers)
REM ------------------------------------------------------------
if defined BROWSER (
  start "" "%BROWSER%" --app=%URL% --window-size=1400,900
) else (
  REM No Chromium browser found -> default browser, normal window.
  start "" "%URL%"
)

endlocal
exit /b 0
