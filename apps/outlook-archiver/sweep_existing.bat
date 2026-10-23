@echo off
title Outlook Archiver - Sweep Existing Items

REM Friendly warning before doing anything destructive.
echo.
echo  ============================================================
echo   Outlook Archiver - Sweep Existing Items
echo  ============================================================
echo.
echo  This will move EVERY existing item in your live Inbox and
echo  Sent Items into the archive PST, using the same code path
echo  the daemon uses for new arrivals.
echo.
echo  Tip: stop the daemon first (stop.bat) to avoid races.
echo  Items already in the archive PST are NOT touched.
echo.
echo  Press any key to run the sweep, or close this window to cancel.
pause >nul

cd /d "%~dp0"
python "%~dp0sweep_existing.py"
echo.
echo  Press any key to close.
pause >nul
