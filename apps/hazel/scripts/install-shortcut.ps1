$appDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$electron = Join-Path $appDir "node_modules\electron\dist\electron.exe"
$icon = Join-Path $appDir "assets\hazel.ico"

$os = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction SilentlyContinue
Write-Host ("OS: {0} build {1}" -f $os.DisplayVersion, $os.CurrentBuildNumber)

$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop 'Hazel.lnk'

$sc = $ws.CreateShortcut($lnk)
$sc.TargetPath = $electron
$sc.Arguments = '"' + $appDir + '"'
$sc.WorkingDirectory = $appDir
$sc.IconLocation = "$icon,0"
$sc.Description = 'Hazel - desktop studio for creators'
$sc.Save()
Write-Host "desktop shortcut: $lnk"

$pinned = Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'
if (-not (Test-Path $pinned)) { New-Item -ItemType Directory -Force -Path $pinned | Out-Null }
Copy-Item $lnk (Join-Path $pinned 'Hazel.lnk') -Force
Write-Host "copied to: $pinned"

Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }
Start-Sleep -Seconds 2
Write-Host "explorer restarted"
