@echo off
title Outlook Archiver - Toggle (click again to reverse)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0outlook_archiver_ctl.ps1" -Action toggle
exit
