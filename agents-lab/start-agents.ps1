param([switch]$Launch)

$Lab = $PSScriptRoot
$VscodeFolder = Join-Path $Lab "A-vscode-agent"
$Hermes = Join-Path $env:LOCALAPPDATA "hermes\bin\hermes.exe"
$Handoff = Join-Path $Lab "HANDOFF.md"

Write-Host "agents-lab workflow: A (VS Code Dev Helper) <-> C (Hermes)"
Write-Host ("  shared handoff : " + $Handoff)
Write-Host ("  VS Code folder : " + $VscodeFolder)
Write-Host ("  Hermes exe     : " + $Hermes + "  (present: " + (Test-Path $Hermes) + ")")

if (-not $Launch) {
    Write-Host ""
    Write-Host "Dry run. Re-run with -Launch to open VS Code and start Hermes." -ForegroundColor Yellow
    return
}

$codeExe = (Get-Command code -ErrorAction SilentlyContinue).Source
if (-not $codeExe) {
    $guess = Join-Path $env:LOCALAPPDATA "Programs\Microsoft VS Code\Code.exe"
    if (Test-Path $guess) { $codeExe = $guess }
}
if ($codeExe) {
    Start-Process $codeExe -ArgumentList $VscodeFolder
    Write-Host ("Opened VS Code on " + $VscodeFolder)
} else {
    Write-Host "VS Code not found; open the folder manually." -ForegroundColor Yellow
}

if (Test-Path $Hermes) {
    Start-Process -FilePath $Hermes
    Write-Host "Started Hermes in a new window (run 'hermes setup' there on first run)."
} else {
    Write-Host ("Hermes not found at " + $Hermes) -ForegroundColor Yellow
}
