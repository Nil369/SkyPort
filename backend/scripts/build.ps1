# Cross-compile SkyPort server for all release platforms (Windows host).
# Run from repo root:  powershell -NoProfile -File backend/scripts/build.ps1
# Or from backend:     powershell -NoProfile -File scripts/build.ps1
#
# Env:
#   VERSION        - semver / tag string for -ldflags (default 0.0.1)
#   SYNC_FRONTEND  - set to 1 to copy ..\frontend\dist -> internal\frontend\dist before build
#   GENERATE_DOCS  - set to 1 to run swag init first

$ErrorActionPreference = "Stop"

# This script lives in backend/scripts; module root is one level up.
$BackendRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$RepoRoot = Resolve-Path (Join-Path $BackendRoot "..")
Set-Location $BackendRoot

$WindowsIcon = Join-Path $RepoRoot "assets\logo.ico"
$ResourceSyso = Join-Path $BackendRoot "cmd\server\resource.syso"

if ($env:SYNC_FRONTEND -eq "1") {
  $RepoRoot = Resolve-Path (Join-Path $BackendRoot "..")
  $FeDist = Join-Path $RepoRoot "frontend\dist"
  $EmbedDist = Join-Path $BackendRoot "internal\frontend\dist"
  if (-not (Test-Path $FeDist)) {
    Write-Error "SYNC_FRONTEND=1 but missing $FeDist - run 'npm run build' in frontend first, or run ..\scripts\sync-embed-ui.ps1"
  }
  Remove-Item -Recurse -Force $EmbedDist -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $EmbedDist | Out-Null
  Copy-Item -Path (Join-Path $FeDist "*") -Destination $EmbedDist -Recurse -Force
  $WebDist = Join-Path $BackendRoot "web\dist"
  Remove-Item -Recurse -Force $WebDist -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $WebDist | Out-Null
  Copy-Item -Path (Join-Path $FeDist "*") -Destination $WebDist -Recurse -Force
  Write-Host "Synced frontend dist -> $EmbedDist"
}

$Version = $env:VERSION
if (-not $Version) { $Version = "0.0.1" }

$Commit = "dev"
try {
  $gitOut = & git -C $BackendRoot rev-parse --short HEAD 2>$null
  if ($LASTEXITCODE -eq 0 -and $gitOut) { $Commit = $gitOut.Trim() }
} catch { }

$BuildTime = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$LdFlags = "-s -w -X skyport/internal/version.Version=$Version -X skyport/internal/version.Commit=$Commit -X skyport/internal/version.BuildTime=$BuildTime"

$GenerateDocs = $env:GENERATE_DOCS
if ($GenerateDocs -eq "1") {
  if (Get-Command swag -ErrorAction SilentlyContinue) {
    swag init -g cmd/server/main.go -o internal/docs --parseDependency --parseInternal
  } else {
    go run github.com/swaggo/swag/cmd/swag@latest init -g cmd/server/main.go -o internal/docs --parseDependency --parseInternal
  }
}

$BinRoot = Join-Path $BackendRoot "..\bin"
New-Item -ItemType Directory -Force -Path $BinRoot | Out-Null

$targets = @(
  @{ GOOS = "linux"; GOARCH = "amd64"; Ext = "" },
  @{ GOOS = "linux"; GOARCH = "arm64"; Ext = "" },
  @{ GOOS = "windows"; GOARCH = "amd64"; Ext = ".exe" },
  @{ GOOS = "darwin"; GOARCH = "amd64"; Ext = "" },
  @{ GOOS = "darwin"; GOARCH = "arm64"; Ext = "" }
)

foreach ($t in $targets) {
  $outDir = Join-Path $BinRoot "$($t.GOOS)-$($t.GOARCH)"
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  try {
    $env:GOOS = $t.GOOS
    $env:GOARCH = $t.GOARCH
    $outFile = Join-Path $outDir "skyport-server$($t.Ext)"
    Write-Host "Building $($t.GOOS)/$($t.GOARCH) -> $outFile"
    if ($t.GOOS -eq "windows" -and (Test-Path $WindowsIcon)) {
      Write-Host "  Windows icon embed: $WindowsIcon -> resource.syso"
      go run github.com/akavel/rsrc@v0.10.2 -ico $WindowsIcon -o $ResourceSyso
    } else {
      Remove-Item $ResourceSyso -ErrorAction SilentlyContinue
    }
    go build -trimpath -ldflags $LdFlags -o $outFile ./cmd/server
  } finally {
    Remove-Item $ResourceSyso -ErrorAction SilentlyContinue
    Remove-Item Env:\GOOS -ErrorAction SilentlyContinue
    Remove-Item Env:\GOARCH -ErrorAction SilentlyContinue
  }
}

Write-Host "Done. Artifacts under $BinRoot"
