$ErrorActionPreference = "Stop"
$Version = $env:VERSION
if (-not $Version) { $Version = "0.0.1" }
$LdFlags = "-s -w -X skyport/internal/version.Version=$Version"
$GenerateDocs = $env:GENERATE_DOCS
if ($GenerateDocs -eq "1") {
  if (Get-Command swag -ErrorAction SilentlyContinue) {
    swag init -g cmd/server/main.go -o internal/docs
  } else {
    go run github.com/swaggo/swag/cmd/swag@latest init -g cmd/server/main.go -o internal/docs
  }
}

$targets = @(
  @{ GOOS = "linux"; GOARCH = "amd64"; Ext = "" },
  @{ GOOS = "linux"; GOARCH = "arm64"; Ext = "" },
  @{ GOOS = "windows"; GOARCH = "amd64"; Ext = ".exe" },
  @{ GOOS = "darwin"; GOARCH = "amd64"; Ext = "" },
  @{ GOOS = "darwin"; GOARCH = "arm64"; Ext = "" }
)

foreach ($t in $targets) {
  $outDir = "../bin/$($t.GOOS)-$($t.GOARCH)"
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  $env:GOOS = $t.GOOS
  $env:GOARCH = $t.GOARCH
  go build -trimpath -ldflags $LdFlags -o "$outDir/skyport$($t.Ext)" ./cmd/server
}
