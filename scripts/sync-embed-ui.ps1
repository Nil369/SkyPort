# Sync a built Vite tree into Go embed paths (Windows-friendly).
# Run from repo root after: cd frontend; npm run build
# Usage: powershell -NoProfile -File scripts/sync-embed-ui.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Src = Join-Path $Root "frontend\dist"
if (-not (Test-Path $Src)) {
  Write-Error "Missing $Src - run 'npm run build' in frontend first."
}

$Dst1 = Join-Path $Root "backend\internal\frontend\dist"
$Dst2 = Join-Path $Root "backend\web\dist"
Remove-Item -Recurse -Force $Dst1, $Dst2 -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $Dst1, $Dst2 | Out-Null
Copy-Item -Path (Join-Path $Src "*") -Destination $Dst1 -Recurse -Force
Copy-Item -Path (Join-Path $Src "*") -Destination $Dst2 -Recurse -Force
Write-Host "Synced UI -> $Dst1 and $Dst2"
