# SkyPort Windows Installer (Fixed for GitHub App Credentials)
# This version properly handles multi-line private keys by passing them as environment variables

Write-Host "========================================="
Write-Host "      Installing SkyPort for Windows"
Write-Host "========================================="

# =========================================
# CONFIG
# =========================================

$installDir = "C:\Program Files\SkyPort"
$dataDir = "$installDir\data"
$workspaceDir = "$installDir\workspace"

$APP_ID = "3771772"

$APP_PRIVATE_KEY = @"
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEArxCKrQlB4dcgiLfC0kK+TcxzqBJqz3VYNf2L17eXB0Pr3JM3...........<EXPECT_I_HAVE_THE_FULL_PVT_KEY_HERE>
-----END RSA PRIVATE KEY-----
"@

# =========================================
# CREATE DIRECTORIES
# =========================================

Write-Host ""
Write-Host "Creating directories..."

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
New-Item -ItemType Directory -Path $workspaceDir -Force | Out-Null

# =========================================
# DOWNLOAD CLI
# =========================================

$cliUrl = "https://github.com/Nil369/SkyPort/releases/latest/download/skyport-windows-amd64.exe"
$cliOutput = "$env:TEMP\skyport.exe"

Write-Host ""
Write-Host "Downloading SkyPort CLI..."

Invoke-WebRequest -Uri $cliUrl -OutFile $cliOutput

Move-Item -Path $cliOutput -Destination "$installDir\skyport.exe" -Force

# =========================================
# DOWNLOAD SERVER
# =========================================

$serverUrl = "https://github.com/Nil369/SkyPort/releases/latest/download/skyport-server-windows-amd64.exe"
$serverOutput = "$env:TEMP\skyport-server.exe"

Write-Host ""
Write-Host "Downloading SkyPort Server..."

Invoke-WebRequest -Uri $serverUrl -OutFile $serverOutput

Move-Item -Path $serverOutput -Destination "$installDir\skyport-server.exe" -Force

# =========================================
# CREATE .ENV FILE (WITHOUT MULTI-LINE KEYS)
# =========================================

Write-Host ""
Write-Host "Generating .env file at root..."

$jwtSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 64 | ForEach-Object {[char]$_})

$envFile = "$installDir\.env"

@"
SKYPORT_HOST=0.0.0.0
SKYPORT_PORT=8080

SKYPORT_ENV=production
SKYPORT_LOG_LEVEL=info

SKYPORT_DB_PATH=$dataDir\skyport.db
SKYPORT_WORKSPACE_ROOT=$workspaceDir

JWT_SECRET=$jwtSecret
JWT_EXPIRES=604800

ENABLE_TERMINAL=true
ENABLE_DOCKER=true
ENABLE_PROJECTS=true
ENABLE_METRICS=true
ENABLE_FILESYSTEM=true

ALLOWED_ORIGINS=*
TRUSTED_PROXIES=127.0.0.1,::1
"@ | Set-Content -Path $envFile -Encoding UTF8

# =========================================
# CREATE STARTUP SCRIPT WITH GITHUB CREDENTIALS
# =========================================

Write-Host ""
Write-Host "Creating startup script with GitHub App credentials..."

$startScript = "$installDir\start-skyport.ps1"

@"
# Set GitHub App credentials as environment variables
# This avoids .env parsing issues with multi-line private keys
`$env:GITHUB_APP_ID = '$APP_ID'
`$env:GITHUB_PRIVATE_KEY = @'
$APP_PRIVATE_KEY
'@

# Start the server from the installation directory so it finds .env
Push-Location '$installDir'
& '.\skyport-server.exe'
Pop-Location
"@ | Set-Content -Path $startScript -Encoding UTF8

# =========================================
# CREATE SCHEDULED TASK (AUTO-START ON BOOT)
# =========================================

Write-Host ""
Write-Host "Configuring auto-start on boot..."

$taskAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$startScript`""
$taskTrigger = New-ScheduledTaskTrigger -AtStartup
$taskPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName "SkyPort" -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Description "SkyPort Backend Server" -Force | Out-Null

Write-Host "Auto-start task registered as 'SkyPort' in Task Scheduler"

# =========================================
# ADD TO PATH
# =========================================

Write-Host ""
Write-Host "Adding SkyPort to PATH..."

$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")

if ($currentPath -notlike "*$installDir*") {
    [Environment]::SetEnvironmentVariable(
        "Path",
        "$currentPath;$installDir",
        "User"
    )
}

$env:Path += ";$installDir"

# =========================================
# VERIFY INSTALLATION
# =========================================

Write-Host ""
Write-Host "Installed files:"
Get-ChildItem $installDir

Write-Host ""
Write-Host "SkyPort CLI Version:"
& "$installDir\skyport.exe" --version

# =========================================
# DONE
# =========================================

Write-Host ""
Write-Host "========================================="
Write-Host " SkyPort installed successfully!"
Write-Host "========================================="

Write-Host ""
Write-Host "CLI Command:"
Write-Host "  skyport"

Write-Host ""
Write-Host "Start Backend Server (Manual):"
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$startScript`""

Write-Host ""
Write-Host "Start Backend Server (Auto-start on Boot):"
Write-Host "  Already configured in Task Scheduler!"

Write-Host ""
Write-Host "Server URL:"
Write-Host "  http://localhost:8080"

Write-Host ""
Write-Host "Environment File:"
Write-Host "  $envFile"

Write-Host ""
Write-Host "Startup Script:"
Write-Host "  $startScript"

Write-Host ""
Write-Host "IMPORTANT:"
Write-Host "  1. Verify GITHUB_APP_ID and GITHUB_PRIVATE_KEY in start-skyport.ps1"
Write-Host "  2. The private key is now passed as an environment variable (more reliable)"
Write-Host "  3. Restart PowerShell/CMD if 'skyport' command is not recognized immediately"
Write-Host "  4. Reboot to test auto-start on boot"

Write-Host ""
