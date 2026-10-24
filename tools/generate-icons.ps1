param(
  [string]$Source = (Join-Path $PSScriptRoot '..\icon.png')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Join-Path $PSScriptRoot '..\android\app\src\main\res'
$source = (Resolve-Path $Source).Path
$origin = [System.Drawing.Image]::FromFile($source)
$originBmp = [System.Drawing.Bitmap]$origin

function New-Graphics([System.Drawing.Bitmap]$bitmap) {
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  return $g
}

function Save-Scaled([System.Drawing.Bitmap]$sourceBmp, [int]$size, [string]$path, [double]$fill = 1.0, [bool]$round = $false) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = New-Graphics $bmp
  if ($round) {
    $clip = New-Object System.Drawing.Drawing2D.GraphicsPath
    $clip.AddEllipse(0, 0, $size, $size)
    $g.SetClip($clip)
    $clip.Dispose()
  }
  $target = [int][Math]::Round($size * $fill)
  $offset = [int][Math]::Round(($size - $target) / 2)
  $g.DrawImage($sourceBmp, $offset, $offset, $target, $target)
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

# Legacy launcher icons (48/72/96/144/192 dp), square and round variants.
$launcher = @{ 'mdpi' = 48; 'hdpi' = 72; 'xhdpi' = 96; 'xxhdpi' = 144; 'xxxhdpi' = 192 }
foreach ($density in $launcher.Keys) {
  $dir = Join-Path $root "mipmap-$density"
  Save-Scaled $originBmp $launcher[$density] (Join-Path $dir 'ic_launcher.png')
  Save-Scaled $originBmp $launcher[$density] (Join-Path $dir 'ic_launcher_round.png') -round $true
}

# Adaptive icon foreground (108 dp canvas, logo inside the safe zone; background is #0B0D12).
$foreground = @{ 'mdpi' = 108; 'hdpi' = 162; 'xhdpi' = 216; 'xxhdpi' = 324; 'xxxhdpi' = 432 }
foreach ($density in $foreground.Keys) {
  $dir = Join-Path $root "mipmap-$density"
  Save-Scaled $originBmp $foreground[$density] (Join-Path $dir 'ic_launcher_foreground.png') -fill 0.82
}

$originBmp.Dispose()
$origin.Dispose()

# Both adaptive icons use the PNG foreground so the vector placeholder is no longer picked up.
$adaptive = @{
  'ic_launcher.xml' = @"
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
"@
  'ic_launcher_round.xml' = @"
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
"@
}
foreach ($name in $adaptive.Keys) {
  $path = Join-Path $root "mipmap-anydpi-v26\$name"
  [System.IO.File]::WriteAllText($path, $adaptive[$name], (New-Object System.Text.UTF8Encoding $false))
}

Write-Host "Icons generated from $source"
