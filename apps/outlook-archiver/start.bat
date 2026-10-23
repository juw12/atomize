@echo off
title Outlook Archiver - Start
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0outlook_archiver_ctl.ps1" -Action start
echo.
pause
