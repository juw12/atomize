@echo off
rem Launch Widget.bat - starts the Pips with no console window.
rem
rem Double-click to run, or from a prompt. Uses pythonw so no console stays open.
rem CWD is forced to this folder so app.py can find assets\, data\ and logs\.
title Pips - Launch
cd /d "%~dp0"
start "" pythonw app.py
