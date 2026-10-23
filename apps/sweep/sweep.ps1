[CmdletBinding()]
param(
  [string]$Message = "",
  [string]$VaultPath = "",
  [string]$NoteFolder = "Update Log",
  [switch]$NoPush,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$env:GIT_TERMINAL_PROMPT = "0"
$env:GCM_INTERACTIVE = "Never"

function Find-Git {
  $candidates = @(
    (Get-Command git -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source),
    (Join-Path $env:LOCALAPPDATA "Programs\Git\cmd\git.exe"),
    (Join-Path $env:LOCALAPPDATA "hermes\tools\git-2.53.0+3-win32-x64\bin\git.exe"),
    (Join-Path $env:ProgramFiles "Git\cmd\git.exe")
  ) | Where-Object { $_ -and (Test-Path $_) }
  if (-not $candidates -and $env:LOCALAPPDATA) {
    $found = Get-ChildItem $env:LOCALAPPDATA -Filter git.exe -Recurse -Depth 4 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    if ($found) { $candidates = @($found) }
  }
  $candidates | Select-Object -First 1
}

$git = Find-Git
if (-not $git) { Write-Error "git not found on PATH or in known locations"; exit 1 }

$root = ""
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try { $root = (& $git rev-parse --show-toplevel 2>$null | Select-Object -First 1) } catch { $root = "" }
$ErrorActionPreference = $prevEap
if (-not $root) {
  Write-Output "Not inside a git repository - run /update from a project folder."
  exit 1
}
$root = "$root".Trim()

if (-not $VaultPath) {
  $VaultPath = if ($env:HAZEL_OBSIDIAN_VAULT) { $env:HAZEL_OBSIDIAN_VAULT } else { Join-Path $env:USERPROFILE "Documents\Obsidian Vault" }
}

$branch = "$(& $git -C $root rev-parse --abbrev-ref HEAD)".Trim()

& $git -C $root add -A
$staged = @(& $git -C $root diff --cached --name-only | Where-Object { $_ -and $_.Trim() -ne "" })
$changed = $staged.Count

if (-not $Message) {
  $Message = "update: sync projects ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))"
}

$commit = ""
$pushed = $false
$pushError = ""

if ($DryRun) {
  $commit = "$(& $git -C $root rev-parse --short HEAD)".Trim()
} else {
  if ($changed -gt 0) {
    & $git -C $root commit -m $Message | Out-Null
  }
  $commit = "$(& $git -C $root rev-parse --short HEAD)".Trim()

  if (-not $NoPush) {
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $tmpOut = [System.IO.Path]::GetTempFileName()
    try {
      & $git -C $root push origin $branch *> $tmpOut
      $pushCode = $LASTEXITCODE
      $pushOut = (Get-Content $tmpOut -Raw)
      $pushed = ($pushCode -eq 0)
      if (-not $pushed) { $pushError = "git push exited $pushCode`n$pushOut".Trim() }
    } catch {
      $pushError = $_.Exception.Message
    } finally {
      $ErrorActionPreference = $prevEap
      Remove-Item $tmpOut -ErrorAction SilentlyContinue
    }
  }
}

$note = ""
if (-not $DryRun -and (Test-Path $VaultPath)) {
  $noteDir = Join-Path $VaultPath $NoteFolder
  if (-not (Test-Path $noteDir)) { New-Item -ItemType Directory -Force -Path $noteDir | Out-Null }
  $note = Join-Path $noteDir ("{0} {1}.md" -f (Get-Date -Format 'yyyy-MM-dd HHmm'), (Split-Path $root -Leaf))

  $lines = @()
  $lines += "# Update - $(Split-Path $root -Leaf)"
  $lines += ""
  $lines += "- When: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
  $lines += "- Repo: $root"
  $lines += "- Branch: $branch"
  $lines += "- Commit: $commit"
  $lines += "- Pushed: $pushed"
  if ($pushError) { $lines += "- Push error: $pushError" }
  $lines += "- Message: $Message"
  $lines += ""
  $lines += "## Changed files ($changed)"
  $lines += ""
  $lines += ($staged | ForEach-Object { "- ``$_``" })
  Set-Content -Path $note -Value ($lines -join "`n") -Encoding UTF8
}

[ordered]@{
  repo = $root
  branch = $branch
  commit = $commit
  message = $Message
  changed = $changed
  pushed = $pushed
  pushError = $pushError
  note = $note
  dryRun = [bool]$DryRun
} | ConvertTo-Json -Depth 4
