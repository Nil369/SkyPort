Write-Host "========================================="
Write-Host "      Installing SkyPort for Windows"
Write-Host "========================================="

# Create installation directory
$installDir = "C:\Program Files\SkyPort"

if (!(Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}

# -----------------------------
# Download CLI
# -----------------------------

$cliUrl = "https://github.com/Nil369/SkyPort/releases/latest/download/skyport-windows-amd64.exe"
$cliOutput = "$env:TEMP\skyport.exe"

Write-Host "Downloading SkyPort CLI..."
Invoke-WebRequest -Uri $cliUrl -OutFile $cliOutput

Move-Item -Path $cliOutput -Destination "$installDir\skyport.exe" -Force

# -----------------------------
# Download Backend Server
# -----------------------------

$serverUrl = "https://github.com/Nil369/SkyPort/releases/latest/download/skyport-server-windows-amd64.exe"
$serverOutput = "$env:TEMP\skyport-server.exe"

Write-Host "Downloading SkyPort Server..."
Invoke-WebRequest -Uri $serverUrl -OutFile $serverOutput

Move-Item -Path $serverOutput -Destination "$installDir\skyport-server.exe" -Force

# -----------------------------
# Add to PATH
# -----------------------------

$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")

if ($currentPath -notlike "*$installDir*") {
    [Environment]::SetEnvironmentVariable(
        "Path",
        "$currentPath;$installDir",
        "User"
    )
}

# Refresh PATH for current session
$env:Path += ";$installDir"

# -----------------------------
# Verify Installation
# -----------------------------

Write-Host ""
Write-Host "Installed files:"
Get-ChildItem $installDir

Write-Host ""
Write-Host "SkyPort CLI Version:"
& "$installDir\skyport.exe" --version


Write-Host "========================================="
Write-Host " SkyPort installed successfully!"
Write-Host "========================================="

Write-Host ""
Write-Host "CLI Command:"
Write-Host "  skyport"

Write-Host ""
Write-Host "Start Web UI:"
Write-Host "  skyport start webui"

Write-Host ""
Write-Host "Start Backend Server:"
Write-Host "  skyport-server"

Write-Host ""
Write-Host "Server URL:"
Write-Host "  http://localhost:8080"

Write-Host ""
Write-Host "IMPORTANT:"
Write-Host "Restart PowerShell/CMD if 'skyport' command is not recognized immediately."

Write-Host ""