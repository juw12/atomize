Add-Type -AssemblyName System.Drawing

$size = 256
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(255, 14, 17, 22))

$rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(255, 183, 209, 122), [System.Drawing.Color]::FromArgb(255, 224, 178, 94), 45)

$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddBezier(128, 18, 58, 72, 44, 132, 62, 178)
$path.AddBezier(62, 178, 78, 222, 178, 222, 194, 178)
$path.AddBezier(194, 178, 212, 132, 198, 72, 128, 18)
$path.CloseFigure()
$g.FillPath($grad, $path)

$midrib = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(190, 74, 88, 40), 5)
$midrib.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$midrib.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawLine($midrib, 128, 30, 128, 226)

$vein = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(130, 74, 88, 40), 3)
$vein.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$vein.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawLine($vein, 128, 92, 170, 126)
$g.DrawLine($vein, 128, 92, 86, 126)
$g.DrawLine($vein, 128, 146, 178, 182)
$g.DrawLine($vein, 128, 146, 78, 182)

$g.Dispose()

$assets = Join-Path $PSScriptRoot "..\assets"
$png = Join-Path $assets "hazel-256.png"
$bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

$pngBytes = [System.IO.File]::ReadAllBytes($png)
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([UInt16]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]1)
$bw.Write([Byte]0)
$bw.Write([Byte]0)
$bw.Write([Byte]0)
$bw.Write([Byte]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]32)
$bw.Write([UInt32]$pngBytes.Length)
$bw.Write([UInt32]22)
$bw.Write($pngBytes)
$bw.Flush()
$ico = Join-Path $assets "hazel.ico"
[System.IO.File]::WriteAllBytes($ico, $ms.ToArray())

Write-Host "wrote $ico"
Write-Host "wrote $png"
