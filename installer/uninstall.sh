#!/usr/bin/env bash
set -euo pipefail

# SkyPort uninstaller (backend service).
#
# Usage:
#   curl -fsSL https://skyport.akashhalder.in/uninstall.sh | bash
#
# Notes:
# - This removes the backend service + binary + config.
# - Data directory (/opt/skyport) is removed ONLY when SKYPORT_PURGE_DATA=1.

SKYPORT_PURGE_DATA="${SKYPORT_PURGE_DATA:-0}"

INSTALL_DIR="/opt/skyport"
BIN_PATH="/usr/local/bin/skyport"
ENV_PATH="/etc/skyport/skyport.env"
SERVICE_PATH="/etc/systemd/system/skyport.service"

log() { echo "[skyport] $*"; }
die() { echo "[skyport] ERROR: $*" >&2; exit 1; }

ensure_root() {
  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    die "please run as root (or use: curl ... | sudo bash)"
  fi
}

main() {
  ensure_root

  if command -v systemctl >/dev/null 2>&1; then
    if systemctl list-unit-files | grep -q '^skyport\.service'; then
      log "stopping service"
      systemctl disable --now skyport || true
      systemctl daemon-reload || true
    fi
  fi

  if [ -f "${SERVICE_PATH}" ]; then
    rm -f "${SERVICE_PATH}"
  fi

  if [ -f "${BIN_PATH}" ]; then
    rm -f "${BIN_PATH}"
  fi

  if [ -f "${ENV_PATH}" ]; then
    rm -f "${ENV_PATH}"
  fi

  if [ -d "$(dirname "${ENV_PATH}")" ]; then
    rmdir "$(dirname "${ENV_PATH}")" 2>/dev/null || true
  fi

  if [ "${SKYPORT_PURGE_DATA}" = "1" ] && [ -d "${INSTALL_DIR}" ]; then
    log "purging data at ${INSTALL_DIR}"
    rm -rf "${INSTALL_DIR}"
  else
    log "keeping data at ${INSTALL_DIR} (set SKYPORT_PURGE_DATA=1 to remove)"
  fi

  log "uninstall complete"
}

main "$@"
