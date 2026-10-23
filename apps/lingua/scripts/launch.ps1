# Hidden GUI launcher for Lingua.
#
# Same environment setup as run.ps1, but starts app.py with pythonw.exe so the
# always-on-top overlay launches from a shortcut with no console window.
# Use run.ps1 instead when you want to see console output / pass arguments.

$ErrorActionPreference = "Stop"

# Force UTF-8 so CJK captions (e.g. 繁體中文) survive.
$env:PYTHONUTF8       = "1"
$env:PYTHONIOENCODING = "utf-8"

# Load local gateway settings if present (git-ignored; see scripts/local-env.ps1).
$localEnv = Join-Path $PSScriptRoot "local-env.ps1"
if (Test-Path $localEnv) { . $localEnv }

# app.py lives one level up from scripts/.
$appDir = Split-Path -Parent $PSScriptRoot

# Prefer pythonw.exe (no console); fall back to python.exe if unavailable.
$pythonw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
if (-not $pythonw) { $pythonw = (Get-Command python.exe).Source }

Start-Process -FilePath $pythonw -ArgumentList "app.py" -WorkingDirectory $appDir
