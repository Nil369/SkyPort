#!/usr/bin/env bash
set -Eeuo pipefail

#
# SkyPort Universal Uninstaller
#
# Removes:
#   - skyport-server
#   - skyport CLI
#   - systemd service (Linux)
#   - launchd service (macOS)
#
# Usage:
#   curl -fsSL https://skyport.akashhalder.in/uninstaller.sh | sudo bash
#
# Optional:
#   SKYPORT_PURGE_DATA=1
#

# =========================================================
# CONFIG
# =========================================================

SKYPORT_PURGE_DATA="${SKYPORT_PURGE_DATA:-0}"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"

if [ "$OS" = "darwin" ]; then
  INSTALL_DIR="/usr/local/skyport"
  CONFIG_DIR="/usr/local/etc/skyport"
else
  INSTALL_DIR="/opt/skyport"
  CONFIG_DIR="/etc/skyport"
fi

SERVER_BIN="/usr/local/bin/skyport-server"
CLI_BIN="/usr/local/bin/skyport"

ENV_FILE="${CONFIG_DIR}/skyport.env"

SERVICE_FILE="/etc/systemd/system/skyport.service"

LAUNCHD_FILE="/Library/LaunchDaemons/in.skyport.server.plist"

# =========================================================
# HELPERS
# =========================================================

log() {
  echo "[skyport] $*"
}

error() {
  echo "[skyport] ERROR: $*" >&2
  exit 1
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    error "Please run as root or use sudo."
  fi
}

detect_os() {
  case "$OS" in
    linux)
      echo "linux"
      ;;
    darwin)
      echo "darwin"
      ;;
    *)
      error "Unsupported OS: $OS"
      ;;
  esac
}

# =========================================================
# LINUX CLEANUP
# =========================================================

remove_systemd_service() {
  if command -v systemctl >/dev/null 2>&1; then
    if systemctl list-unit-files | grep -q '^skyport\.service'; then
      log "Stopping systemd service..."
      systemctl disable --now skyport >/dev/null 2>&1 || true
      systemctl daemon-reload || true
    fi
  fi

  rm -f "${SERVICE_FILE}" || true
}

# =========================================================
# MACOS CLEANUP
# =========================================================

remove_launchd_service() {
  if [ -f "${LAUNCHD_FILE}" ]; then
    log "Stopping launchd service..."
    launchctl unload "${LAUNCHD_FILE}" >/dev/null 2>&1 || true
    rm -f "${LAUNCHD_FILE}" || true
  fi

  rm -f /var/log/skyport.log || true
  rm -f /var/log/skyport-error.log || true
}

# =========================================================
# PROCESS CLEANUP
# =========================================================

stop_running_processes() {
  local pids
  pids="$(pgrep -f 'skyport-server' 2>/dev/null || true)"

  if [ -z "${pids}" ]; then
    return
  fi

  log "Stopping running SkyPort processes..."

  kill -TERM ${pids} >/dev/null 2>&1 || true

  pids="$(pgrep -f 'skyport-server' 2>/dev/null || true)"
  if [ -n "${pids}" ]; then
    kill -KILL ${pids} >/dev/null 2>&1 || true
  fi
}

# =========================================================
# REMOVE FILES
# =========================================================

remove_binaries() {
  log "Removing binaries..."

  rm -f "${SERVER_BIN}" || true
  rm -f "${CLI_BIN}" || true
}

remove_config() {
  log "Removing configuration..."

  rm -f "${ENV_FILE}" || true

  rmdir "${CONFIG_DIR}" >/dev/null 2>&1 || true
}

remove_data() {
  if [ "${SKYPORT_PURGE_DATA}" = "1" ]; then
    log "Purging data directory..."
    rm -rf "${INSTALL_DIR}" || true
  else
    log "Keeping data directory:"
    log "  ${INSTALL_DIR}"
    log ""
    log "Set SKYPORT_PURGE_DATA=1 to remove it."
  fi
}

remove_user() {
  if [ "$(detect_os)" = "linux" ]; then
    if id -u skyport >/dev/null 2>&1; then
      log "Removing skyport user..."
      userdel skyport >/dev/null 2>&1 || true
    fi
  fi
}

# =========================================================
# MAIN
# =========================================================

main() {
  require_root

  local os
  os="$(detect_os)"

  log "Detected OS: ${os}"

  if [ "${os}" = "linux" ]; then
    remove_systemd_service
  fi

  if [ "${os}" = "darwin" ]; then
    remove_launchd_service
  fi

  stop_running_processes

  remove_binaries

  remove_config

  remove_data

  remove_user

  echo
  echo "===================================================="
  echo " SkyPort Uninstalled Successfully"
  echo "===================================================="
  echo

  if [ "${SKYPORT_PURGE_DATA}" != "1" ]; then
    echo "Data directory preserved:"
    echo "  ${INSTALL_DIR}"
    echo
  fi
}

main "$@"
