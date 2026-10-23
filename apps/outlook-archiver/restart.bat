@echo off
title Outlook Archiver - Restart
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0outlook_archiver_ctl.ps1" -Action restart
echo.
pause
