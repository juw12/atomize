<#
.SYNOPSIS
    Create a desktop shortcut for toggle.bat with a custom Outlook-themed
    toggle icon, and try to pin it to the taskbar.

.DESCRIPTION
    Steps performed:
      1. Generate outlook_archiver.ico (Outlook-blue rounded button with
         play + stop symbols) using .NET System.Drawing.
      2. Create "Outlook Archiver - Toggle.lnk" on the user's desktop,
         pointing at toggle.bat with the new icon.
      3. Try to programmatically pin the .lnk to the taskbar via
         Shell.Application.InvokeVerb("taskbarpin").
         If pinning fails (some Windows builds restrict this), the user
         is told to right-click the shortcut and choose "Pin to taskbar".

    Safe to re-run: regenerates the icon and shortcut every time.
#>

$ErrorActionPreference = 'Stop'

$installDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$toggleBat   = Join-Path $installDir 'toggle.bat'
$iconPath    = Join-Path $installDir 'outlook_archiver.ico'
$shortcutDir = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $shortcutDir 'Outlook Archiver - Toggle.lnk'

if (-not (Test-Path -LiteralPath $toggleBat)) {
    throw "Cannot find $toggleBat. Run from the install folder."
}

# ---------------------------------------------------------------
# 1. Generate the custom Outlook-themed toggle icon
# ---------------------------------------------------------------
Add-Type -AssemblyName System.Drawing

$size = 256
$bmp  = New-Object System.Drawing.Bitmap($size, $size)
$g    = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Outlook 2016 brand blue
$outlookBlue = [System.Drawing.Color]::FromArgb(0, 120, 212)
$white       = [System.Drawing.Color]::White

# Rounded button background
$bgBrush = New-Object System.Drawing.SolidBrush($outlookBlue)
$bgPath  = New-Object System.Drawing.Drawing2D.GraphicsPath
$radius  = 48
$bgPath.AddArc(0,               0,               $radius, $radius, 180, 90)
$bgPath.AddArc($size-$radius,   0,               $radius, $radius, 270, 90)
$bgPath.AddArc($size-$radius,   $size-$radius,   $radius, $radius,   0, 90)
$bgPath.AddArc(0,               $size-$radius,   $radius, $radius,  90, 90)
$bgPath.CloseFigure()
$g.FillPath($bgBrush, $bgPath)

# Subtle highlight at the top
$highlight = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(60, 255, 255, 255))
$highlightPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$highlightPath.AddArc(0,             0,             $radius, $radius, 180, 90)
$highlightPath.AddArc($size-$radius, 0,             $radius, $radius, 270, 90)
$highlightPath.AddArc($size-$radius, 12,            $radius, $radius,   0, 91)
$highlightPath.AddArc(0,             12,            $radius, $radius,  90, 91)
$highlightPath.CloseFigure()
$g.FillPath($highlight, $highlightPath)

# Play triangle (left half) - "start"
$playBrush = New-Object System.Drawing.SolidBrush($white)
$playPts = @(
    (New-Object System.Drawing.PointF(50,  48)),
    (New-Object System.Drawing.PointF(132, 128)),
    (New-Object System.Drawing.PointF(50, 208))
)
$g.FillPolygon($playBrush, $playPts)

# Vertical separator
$sepPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(120, 255, 255, 255), 3)
$g.DrawLine($sepPen, 128, 56, 128, 200)

# Stop bars (right half) - "stop"
$g.FillRectangle($playBrush, 144, 48, 60, 160)

# Save as .ico (256x256 only; Windows scales down for smaller sizes)
$hicon = $bmp.GetHicon()
$icon  = [System.Drawing.Icon]::FromHandle($hicon)
$fs    = [System.IO.File]::Create($iconPath)
$icon.Save($fs)
$fs.Close()
$g.Dispose()
$bmp.Dispose()
$icon.Dispose()

Write-Host "Icon created: $iconPath"

# ---------------------------------------------------------------
# 2. Create the .lnk shortcut on the desktop
# ---------------------------------------------------------------
$ws = New-Object -ComObject WScript.Shell
$shortcut = $ws.CreateShortcut($shortcutPath)
$shortcut.TargetPath       = $toggleBat
$shortcut.WorkingDirectory  = $installDir
$shortcut.IconLocation      = "$iconPath,0"
$shortcut.Description      = 'Toggle Outlook Archiver daemon (Start/Stop)'
$shortcut.WindowStyle      = 1  # normal window
$shortcut.Save()

Write-Host "Shortcut created: $shortcutPath"

# ---------------------------------------------------------------
# 3. Try to pin to taskbar
# ---------------------------------------------------------------
$pinned = $false
try {
    $shell  = New-Object -ComObject Shell.Application
    $folder = $shell.NameSpace($shortcutDir)
    $item   = $folder.ParseName([System.IO.Path]::GetFileName($shortcutPath))
    if ($item) {
        $item.InvokeVerb('taskbarpin')
        $pinned = $true
    }
} catch {
    # Pinning is restricted on some Windows builds; fall back below.
}

Write-Host ''
if ($pinned) {
    Write-Host 'Pinned to taskbar.' -ForegroundColor Green
} else {
    Write-Host 'Could not pin automatically. To pin manually:' -ForegroundColor Yellow
    Write-Host "  1. Open: $shortcutPath"
    Write-Host '  2. Right-click it -> "Pin to taskbar"'
}

Write-Host ''
Write-Host 'Done. Click the new taskbar icon once to start, again to stop.' -ForegroundColor Cyan
