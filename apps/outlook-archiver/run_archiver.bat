@echo off
REM Outlook Archiver launcher
REM - Sets cwd to script directory so the log file lives next to it
REM - Forwards Ctrl+C to python so foreground users can stop cleanly

cd /d "%~dp0"
python.exe outlook_archiver.py
