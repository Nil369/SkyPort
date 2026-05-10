#!/usr/bin/env sh
set -eu

VERSION="${VERSION:-0.0.1}"
LDFLAGS="-s -w -X skyport/internal/version.Version=${VERSION}"
APP="skyport"

build() {
  GOOS="$1" GOARCH="$2" go build -trimpath -ldflags "${LDFLAGS}" -o "../bin/${GOOS}-${GOARCH}/${APP}$3" ./cmd/server
}

mkdir -p ../bin/linux-amd64 ../bin/linux-arm64 ../bin/windows-amd64 ../bin/darwin-amd64 ../bin/darwin-arm64
build linux amd64 ""
build linux arm64 ""
build windows amd64 ".exe"
build darwin amd64 ""
build darwin arm64 ""
