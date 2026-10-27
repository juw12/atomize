@echo off
rem Installs Lingua for the current user (no admin needed):
rem  - copies this folder to %LOCALAPPDATA%\Programs\Lingua
rem  - adds Start menu + Desktop shortcuts and an entry in Settings > Apps
rem Your lingua.env (gateway settings) is copied too and kept on updates.
start "" "%~dp0Lingua.exe" --install
