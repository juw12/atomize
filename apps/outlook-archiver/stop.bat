@echo off
title Outlook Archiver - Stop
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0outlook_archiver_ctl.ps1" -Action stop
echo.
pause
