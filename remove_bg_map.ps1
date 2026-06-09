Add-Type -AssemblyName System.Drawing

$filePath = "c:\Users\Admin\OneDrive\Desktop\New folder\public\worlds_icon.png"
if (-Not (Test-Path $filePath)) {
    Write-Error "File not found"
    exit 1
}

Write-Output "Loading image: $filePath"
$img = [System.Drawing.Image]::FromFile($filePath)

# Convert to PNG with alpha channel
$bmp = New-Object System.Drawing.Bitmap($img.Width, $img.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($img, 0, 0, $img.Width, $img.Height)
$g.Dispose()
$img.Dispose()

Write-Output "Image size: $($bmp.Width)x$($bmp.Height)"

# Sample corner pixels to determine background color
$bgPixel = $bmp.GetPixel(0, 0)
Write-Output "Background color at (0,0): R=$($bgPixel.R), G=$($bgPixel.G), B=$($bgPixel.B)"

$changed = 0
$tolerance = 40.0

for ($x = 0; $x -lt $bmp.Width; $x++) {
    for ($y = 0; $y -lt $bmp.Height; $y++) {
        $pixel = $bmp.GetPixel($x, $y)
        
        $dR = [double]($pixel.R - $bgPixel.R)
        $dG = [double]($pixel.G - $bgPixel.G)
        $dB = [double]($pixel.B - $bgPixel.B)
        $distance = [Math]::Sqrt($dR*$dR + $dG*$dG + $dB*$dB)
        
        if ($distance -lt $tolerance) {
            $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
            $changed++
        }
    }
}

Write-Output "Changed $changed pixels to transparent."

$tempPath = "c:\Users\Admin\OneDrive\Desktop\New folder\public\worlds_icon_temp.png"
$bmp.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Remove-Item $filePath -Force
Move-Item $tempPath $filePath -Force

Write-Output "Map icon background removal complete!"
