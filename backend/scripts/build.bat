@echo off
setlocal enabledelayedexpansion

if "%VERSION%"=="" set VERSION=0.0.1
set LDFLAGS=-s -w -X skyport/internal/version.Version=%VERSION%

call :build linux amd64
call :build linux arm64
call :build windows amd64 .exe
call :build darwin amd64
call :build darwin arm64
exit /b 0

:build
set GOOS=%1
set GOARCH=%2
set EXT=%3
if "%EXT%"=="" set EXT=
mkdir ..\bin\%GOOS%-%GOARCH% >nul 2>nul
set GOOS=%GOOS%
set GOARCH=%GOARCH%
go build -trimpath -ldflags "%LDFLAGS%" -o "..\bin\%GOOS%-%GOARCH%\skyport%EXT%" .\cmd\server
exit /b %errorlevel%
