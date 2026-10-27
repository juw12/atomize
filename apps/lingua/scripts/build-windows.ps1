# Build the Lingua Windows app (Lingua.exe + web pages) into dist\Lingua and a zip.
#   powershell -ExecutionPolicy Bypass -File apps\lingua\scripts\build-windows.ps1 [-Out <folder>]
# Uses a private virtual environment, so the system Python is left untouched.
param([string]$Out = "$PSScriptRoot\..\dist")
$ErrorActionPreference = "Stop"
$app = Resolve-Path "$PSScriptRoot\.."
$work = Join-Path $env:TEMP "lingua-build"
$venv = Join-Path $work "venv"
if (-not (Test-Path "$venv\Scripts\python.exe")) { python -m venv $venv }
& "$venv\Scripts\python.exe" -m pip install --quiet --disable-pip-version-check pillow requests qrcode pyinstaller ctranslate2 sentencepiece sacremoses subword-nmt opencc-python-reimplemented
& "$venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean `
    --distpath $Out --workpath (Join-Path $work "pyi") "$app\packaging\lingua.spec"
Copy-Item "$app\packaging\lingua.env.example" "$Out\Lingua\lingua.env.example" -Force
Copy-Item "$app\packaging\README-laptop.txt" "$Out\Lingua\README.txt" -Force
Copy-Item "$app\packaging\Install Lingua.cmd" "$Out\Lingua\Install Lingua.cmd" -Force
Copy-Item "$app\packaging\THIRD_PARTY_NOTICES.txt" "$Out\Lingua\THIRD_PARTY_NOTICES.txt" -Force
# The release zip never contains lingua.env (private gateway settings); users keep their own.
Remove-Item "$Out\Lingua\lingua.env" -ErrorAction SilentlyContinue
$zip = Join-Path $Out "Lingua-windows.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path "$Out\Lingua" -DestinationPath $zip
Write-Host "Built $Out\Lingua\Lingua.exe and $zip"
