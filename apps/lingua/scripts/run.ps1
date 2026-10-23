# Launcher for Lingua. Sets the UTF-8 environment, then runs the app from the
# lingua directory. All arguments are forwarded straight to app.py, so
# `run.ps1 --selftest` is the same as `python app.py --selftest`.

param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [object[]]$AppArgs
)

$ErrorActionPreference = "Stop"

# Force UTF-8 so CJK captions (e.g. 繁體中文) survive the console encoding.
$env:PYTHONUTF8       = "1"
$env:PYTHONIOENCODING = "utf-8"

# app.py lives one level up from scripts/.
$appDir = Split-Path -Parent $PSScriptRoot
Set-Location $appDir

if ($AppArgs -and $AppArgs.Count -gt 0) {
  python app.py @AppArgs
} else {
  python app.py
}

exit $LASTEXITCODE
