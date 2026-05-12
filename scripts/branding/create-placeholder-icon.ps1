# Creates a minimal assets/logo.ico if missing (Windows .NET System.Drawing).
# Run from repo root: powershell -NoProfile -File scripts/branding/create-placeholder-icon.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$iconPath = Join-Path $RepoRoot "assets\logo.ico"
New-Item -ItemType Directory -Force -Path (Split-Path $iconPath) | Out-Null
if (Test-Path $iconPath) {
  Write-Host "Exists: $iconPath"
  exit 0
}

Add-Type -AssemblyName System.Drawing
$size = 64
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(30, 58, 138))
$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(147, 197, 253))
$font = New-Object System.Drawing.Font("Segoe UI", 28, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString("S", $font, $brush, 18, 10)
$g.Dispose()
$brush.Dispose()

$fs = [System.IO.File]::Open($iconPath, [System.IO.FileMode]::Create)
$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$icon.Save($fs)
$fs.Dispose()
$icon.Dispose()
$bmp.Dispose()
Write-Host "Wrote placeholder $iconPath"
