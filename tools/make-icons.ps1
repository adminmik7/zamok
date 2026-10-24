Add-Type -AssemblyName System.Drawing
$res = 'D:\dev\zamok\android\app\src\main\res'
$sizes = @{ 'mipmap-mdpi' = 48; 'mipmap-hdpi' = 72; 'mipmap-xhdpi' = 96; 'mipmap-xxhdpi' = 144; 'mipmap-xxxhdpi' = 192 }

function New-Icon($size, $path) {
    [double]$s = $size
    [double]$pad = $s * 0.18
    [double]$w = $s - 2 * $pad
    [double]$x = $pad
    [double]$y = $pad

    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::FromArgb(11, 13, 18))

    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(99, 102, 241), ([Math]::Max(2.0, $s * 0.075)))
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    $body = [System.Drawing.Rectangle]::new([int][Math]::Round($x), [int][Math]::Round($y + $w * 0.34), [int][Math]::Round($w), [int][Math]::Round($w * 0.60))
    $g.DrawRectangle($pen, $body)

    $archRect = [System.Drawing.RectangleF]::new([single]($x + $w * 0.20), [single]$y, [single]($w * 0.60), [single]($w * 0.60))
    $g.DrawArc($pen, $archRect, 180, 180)

    [double]$keyD = $w * 0.16
    $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(99, 102, 241))
    $g.FillEllipse($brush, [single]($x + $w / 2 - $keyD / 2), [single]($y + $w * 0.54), [single]$keyD, [single]$keyD)

    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

foreach ($entry in $sizes.GetEnumerator()) {
    $dir = Join-Path $res $entry.Key
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    New-Icon $entry.Value (Join-Path $dir 'ic_launcher.png')
    New-Icon $entry.Value (Join-Path $dir 'ic_launcher_round.png')
}
"icons done"
