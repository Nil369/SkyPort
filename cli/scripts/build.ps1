# Cross-compile SkyPort CLI for all release platforms (Windows host).
# Run from repo root:  powershell -NoProfile -File cli/scripts/build.ps1
# Or from cli:         powershell -NoProfile -File scripts/build.ps1
#
# Env:
#   VERSION  - semver / tag string for -ldflags (default 0.0.1)

$ErrorActionPreference = "Stop"

$CliRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $CliRoot

$Version = $env:VERSION
if (-not $Version) { $Version = "0.0.1" }

$Commit = "dev"
try {
  $gitOut = & git -C $CliRoot rev-parse --short HEAD 2>$null
  if ($LASTEXITCODE -eq 0 -and $gitOut) { $Commit = $gitOut.Trim() }
} catch { }

$BuildTime = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$LdFlags = "-s -w -X skyport-cli/internal/version.Version=$Version -X skyport-cli/internal/version.Commit=$Commit -X skyport-cli/internal/version.BuildTime=$BuildTime"

# Match Unix Makefile + release.yml: ../bin/cli/<GOOS>-<GOARCH>/
$BinRoot = Join-Path $CliRoot "..\bin\cli"
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
    $outFile = Join-Path $outDir "skyport$($t.Ext)"
    Write-Host "Building $($t.GOOS)/$($t.GOARCH) -> $outFile"
    go build -trimpath -ldflags $LdFlags -o $outFile .
  } finally {
    Remove-Item Env:\GOOS -ErrorAction SilentlyContinue
    Remove-Item Env:\GOARCH -ErrorAction SilentlyContinue
  }
}

Write-Host "Done. Artifacts under $BinRoot (layout matches release.yml: bin/cli/<GOOS>-<GOARCH>/)"
