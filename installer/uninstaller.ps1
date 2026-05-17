Write-Host "========================================="
Write-Host "     Uninstalling SkyPort for Windows"
Write-Host "========================================="

# --------------------------------------------------
# CONFIG
# --------------------------------------------------

$installDir = "C:\Program Files\SkyPort"

$cliPath = "$installDir\skyport.exe"
$serverPath = "$installDir\skyport-server.exe"

# Set to $true if you want to remove the install directory completely
$purgeData = $false

# --------------------------------------------------
# HELPERS
# --------------------------------------------------

function Remove-FromPath {
    param (
        [string]$PathToRemove
    )

    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")

    if ($currentPath -like "*$PathToRemove*") {

        $newPath = ($currentPath.Split(";") | Where-Object {
            $_ -and $_ -ne $PathToRemove
        }) -join ";"

        [Environment]::SetEnvironmentVariable(
            "Path",
            $newPath,
            "User"
        )

        Write-Host "Removed from PATH:"
        Write-Host "  $PathToRemove"
    }
}

# --------------------------------------------------
# STOP RUNNING PROCESSES
# --------------------------------------------------

Write-Host ""
Write-Host "Stopping running SkyPort processes..."

Get-Process -Name "skyport-server" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name "skyport" -ErrorAction SilentlyContinue | Stop-Process -Force

# --------------------------------------------------
# REMOVE BINARIES
# --------------------------------------------------

Write-Host ""
Write-Host "Removing binaries..."

if (Test-Path $cliPath) {
    Remove-Item $cliPath -Force
    Write-Host "Removed:"
    Write-Host "  $cliPath"
}

if (Test-Path $serverPath) {
    Remove-Item $serverPath -Force
    Write-Host "Removed:"
    Write-Host "  $serverPath"
}

# --------------------------------------------------
# REMOVE FROM PATH
# --------------------------------------------------

Write-Host ""
Write-Host "Removing SkyPort from PATH..."

Remove-FromPath -PathToRemove $installDir

# Refresh PATH for current session
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
            [Environment]::GetEnvironmentVariable("Path", "User")

# --------------------------------------------------
# REMOVE INSTALL DIRECTORY
# --------------------------------------------------

if ($purgeData -eq $true) {

    Write-Host ""
    Write-Host "Removing installation directory..."

    if (Test-Path $installDir) {
        Remove-Item $installDir -Recurse -Force
    }

} else {

    Write-Host ""
    Write-Host "Keeping installation directory:"
    Write-Host "  $installDir"

    Write-Host ""
    Write-Host "Set:"
    Write-Host "  `$purgeData = `$true"
    Write-Host "to remove it completely."
}

# --------------------------------------------------
# DONE
# --------------------------------------------------

Write-Host ""
Write-Host "========================================="
Write-Host " SkyPort uninstalled successfully!"
Write-Host "========================================="

Write-Host ""
Write-Host "IMPORTANT:"
Write-Host "Restart PowerShell/CMD if 'skyport' command still appears."
Write-Host ""