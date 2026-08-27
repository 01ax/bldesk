Add-Type -AssemblyName System.Drawing

$resDir = "C:\Users\adamw\bldesk\resources"
if (!(Test-Path $resDir)) { New-Item -ItemType Directory -Path $resDir -Force }

# Create high-res 256x256 bitmap
function Generate-BLIcon([int]$size, [string]$outputPath) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # 1. Background rounded rectangle
    $bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 15, 23, 42)) # Slate 900
    $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    
    # Rounded path
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $radius = [int]($size * 0.22)
    $diameter = $radius * 2
    $path.AddArc(0, 0, $diameter, $diameter, 180, 90)
    $path.AddArc($size - $diameter, 0, $diameter, $diameter, 270, 90)
    $path.AddArc($size - $diameter, $size - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc(0, $size - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()

    $g.FillPath($bgBrush, $path)

    # Sky Blue Border
    $borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(200, 56, 189, 248), [Math]::Max(1.0, $size * 0.03))
    $g.DrawPath($borderPen, $path)

    # 2. Draw 3 Cloud / Server Blade bars
    $bladeBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 2, 132, 199)) # Sky 600
    $ledBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 56, 189, 248))   # Sky 400
    $lineBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 125, 211, 252)) # Sky 300

    $bladeWidth = [int]($size * 0.62)
    $bladeHeight = [int]($size * 0.13)
    $bladeX = [int](($size - $bladeWidth) / 2)

    $yPositions = @( [int]($size * 0.23), [int]($size * 0.43), [int]($size * 0.63) )

    foreach ($y in $yPositions) {
        # Draw blade body
        $bPath = New-Object System.Drawing.Drawing2D.GraphicsPath
        $bRad = [int]($bladeHeight * 0.35)
        $bDiam = $bRad * 2
        $bPath.AddArc($bladeX, $y, $bDiam, $bDiam, 180, 90)
        $bPath.AddArc($bladeX + $bladeWidth - $bDiam, $y, $bDiam, $bDiam, 270, 90)
        $bPath.AddArc($bladeX + $bladeWidth - $bDiam, $y + $bladeHeight - $bDiam, $bDiam, $bDiam, 0, 90)
        $bPath.AddArc($bladeX, $y + $bladeHeight - $bDiam, $bDiam, $bDiam, 90, 90)
        $bPath.CloseFigure()
        $g.FillPath($bladeBrush, $bPath)

        # LED Indicator Dot
        $dotRadius = [Math]::Max(1.5, $size * 0.03)
        $dotX = $bladeX + [int]($bladeWidth * 0.12)
        $dotY = $y + [int]($bladeHeight / 2) - $dotRadius
        $g.FillEllipse($ledBrush, $dotX, $dotY, ($dotRadius * 2), ($dotRadius * 2))

        # Activity Line
        $lineX = $bladeX + [int]($bladeWidth * 0.32)
        $lineWidth = [int]($bladeWidth * 0.54)
        $lineH = [Math]::Max(1.0, $size * 0.02)
        $lineY = $y + [int]($bladeHeight / 2) - [int]($lineH / 2)
        $g.FillRectangle($lineBrush, $lineX, $lineY, $lineWidth, $lineH)
    }

    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

# Generate PNGs
Generate-BLIcon 256 "$resDir\icon.png"
Generate-BLIcon 32 "$resDir\tray.png"
Generate-BLIcon 16 "$resDir\tray-16.png"
Generate-BLIcon 48 "$resDir\icon-48.png"

# Convert 256x256 PNG to genuine Windows ICO using System.Drawing.Icon
$pngBmp = [System.Drawing.Bitmap]::FromFile("$resDir\icon.png")
$hIcon = $pngBmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)

$fs = New-Object System.IO.FileStream "$resDir\icon.ico", ([System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()
$pngBmp.Dispose()

Write-Host "Native Windows Icon and Tray PNGs created successfully in $resDir"
