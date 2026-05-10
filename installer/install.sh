#!/usr/bin/env bash
set -euo pipefail

# SkyPort installer (backend service).
#
# Usage (recommended):
#   curl -fsSL https://skyport.akashhalder.in/install.sh | bash
#
# Optional env overrides:
#   SKYPORT_REPO="Nil369/SkyPort"
#   SKYPORT_VERSION="v0.0.1"   # or "latest" (default)
#   SKYPORT_PORT="8080"
#   SKYPORT_HOST="0.0.0.0"
#   SKYPORT_PUBLIC_URL="https://api.example.com"
#   SKYPORT_DASHBOARD_URL="https://skyport.akashhalder.in"
#
# Notes:
# - This installs ONLY the backend binary + service.
# - If you host your dashboard on Vercel, nothing needs to be downloaded for UI.
# - If you want a single-binary "embedded UI", that requires a separate build mode
#   (serve built frontend assets from the Go server). Not enabled by this script.

SKYPORT_REPO="${SKYPORT_REPO:-Nil369/SkyPort}"
SKYPORT_VERSION="${SKYPORT_VERSION:-latest}"

SKYPORT_HOST="${SKYPORT_HOST:-localhost}"
SKYPORT_PORT="${SKYPORT_PORT:-8080}"
SKYPORT_PUBLIC_URL="${SKYPORT_PUBLIC_URL:-}"
SKYPORT_DASHBOARD_URL="${SKYPORT_DASHBOARD_URL:-https://skyport.akashhalder.in}"

INSTALL_DIR="/opt/skyport"
DATA_DIR="${INSTALL_DIR}/data"
WORKSPACE_DIR="${INSTALL_DIR}/workspace"
BIN_PATH="/usr/local/bin/skyport"
ENV_PATH="/etc/skyport/skyport.env"
SERVICE_PATH="/etc/systemd/system/skyport.service"

log() { echo "[skyport] $*"; }
die() { echo "[skyport] ERROR: $*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

detect_os() {
  local os
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$os" in
    linux) echo "linux" ;;
    darwin) echo "darwin" ;;
    *) die "unsupported OS: $os (installer supports linux/darwin). Windows: use manual binary download for now." ;;
  esac
}

detect_arch() {
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) echo "amd64" ;;
    aarch64|arm64) echo "arm64" ;;
    *) die "unsupported architecture: $arch" ;;
  esac
}

latest_tag() {
  # No jq dependency; parse JSON with grep/sed.
  curl -fsSL "https://api.github.com/repos/${SKYPORT_REPO}/releases/latest" \
    | grep -m 1 '"tag_name"' \
    | sed -E 's/.*"tag_name":[[:space:]]*"([^"]+)".*/\1/'
}

download_url() {
  local version="$1"
  local os="$2"
  local arch="$3"
  # Our build output directory format is: bin/<os>-<arch>/skyport(.exe)
  # For releases, publish assets as:
  #   skyport-<os>-<arch>  (no extension)
  #
  # Example:
  #   https://github.com/Nil369/SkyPort/releases/download/v0.0.1/skyport-linux-amd64
  echo "https://github.com/${SKYPORT_REPO}/releases/download/${version}/skyport-${os}-${arch}"
}

ensure_root() {
  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    die "please run as root (or use: curl ... | sudo bash)"
  fi
}

create_user_if_needed() {
  if id -u skyport >/dev/null 2>&1; then
    return
  fi
  if command -v useradd >/dev/null 2>&1; then
    useradd --system --home "${INSTALL_DIR}" --shell /usr/sbin/nologin skyport || true
  elif command -v adduser >/dev/null 2>&1; then
    adduser --system --home "${INSTALL_DIR}" --disabled-login --disabled-password skyport || true
  fi
}

write_env() {
  mkdir -p "$(dirname "${ENV_PATH}")"

  # Generate JWT secret if not provided.
  local jwt_secret="${JWT_SECRET:-}"
  if [ -z "${jwt_secret}" ]; then
    jwt_secret="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48)"
  fi

  # Default: 7 days
  local jwt_expires="${JWT_EXPIRES:-604800}"

  # Allow dashboard origin for browser API calls.
  local allowed_origins="${ALLOWED_ORIGINS:-${SKYPORT_DASHBOARD_URL},http://localhost:3000,http://localhost:5173}"

  cat >"${ENV_PATH}" <<EOF
SKYPORT_HOST=${SKYPORT_HOST}
SKYPORT_PORT=${SKYPORT_PORT}
SKYPORT_DB_PATH=${DATA_DIR}/skyport.db
SKYPORT_WORKSPACE_ROOT=${WORKSPACE_DIR}
SKYPORT_ENV=production
SKYPORT_LOG_LEVEL=info
SKYPORT_SHUTDOWN_TIMEOUT_SEC=10

JWT_SECRET=${jwt_secret}
JWT_EXPIRES=${jwt_expires}
ALLOWED_ORIGINS=${allowed_origins}
TRUSTED_PROXIES=127.0.0.1,::1

ENABLE_TERMINAL=true
ENABLE_METRICS=true
ENABLE_DOCKER=true
ENABLE_FILESYSTEM=true
ENABLE_PROJECTS=true
EOF

  if [ -n "${SKYPORT_PUBLIC_URL}" ]; then
    echo "SKYPORT_PUBLIC_URL=${SKYPORT_PUBLIC_URL}" >>"${ENV_PATH}"
  fi

  chmod 600 "${ENV_PATH}"
}

install_binary_linux() {
  local url="$1"
  log "downloading ${url}"
  curl -fsSL "${url}" -o "${BIN_PATH}"
  chmod 755 "${BIN_PATH}"
}

install_service_linux() {
  mkdir -p "${INSTALL_DIR}" "${DATA_DIR}" "${WORKSPACE_DIR}"
  chown -R skyport:skyport "${INSTALL_DIR}" || true

  cat >"${SERVICE_PATH}" <<EOF
[Unit]
Description=SkyPort Backend API
After=network.target

[Service]
Type=simple
User=skyport
Group=skyport
EnvironmentFile=${ENV_PATH}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${BIN_PATH}
Restart=always
RestartSec=2
NoNewPrivileges=true

# Hardening (safe defaults)
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${INSTALL_DIR} /tmp

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now skyport
}

main() {
  ensure_root
  need_cmd curl

  local os arch version url
  os="$(detect_os)"
  arch="$(detect_arch)"

  if [ "${SKYPORT_VERSION}" = "latest" ]; then
    log "resolving latest release tag for ${SKYPORT_REPO}"
    version="$(latest_tag)"
    [ -n "${version}" ] || die "could not resolve latest release tag"
  else
    version="${SKYPORT_VERSION}"
  fi

  url="$(download_url "${version}" "${os}" "${arch}")"

  log "installing skyport ${version} (${os}-${arch})"
  create_user_if_needed
  mkdir -p "${INSTALL_DIR}" "${DATA_DIR}" "${WORKSPACE_DIR}"

  if [ "${os}" = "linux" ]; then
    install_binary_linux "${url}"
    write_env
    install_service_linux
    log "installed. API: http://<server-ip>:${SKYPORT_PORT}"
    log "swagger: http://<server-ip>:${SKYPORT_PORT}/docs/index.html"
    log "dashboard: ${SKYPORT_DASHBOARD_URL} (Vercel hosted UI)"
  else
    # macOS: install binary and env, but don't attempt to create a daemon by default.
    curl -fsSL "${url}" -o "${BIN_PATH}"
    chmod 755 "${BIN_PATH}"
    mkdir -p "${INSTALL_DIR}" "${DATA_DIR}" "${WORKSPACE_DIR}"
    write_env
    log "installed binary at ${BIN_PATH}"
    log "run: sudo ${BIN_PATH}"
    log "swagger: http://127.0.0.1:${SKYPORT_PORT}/docs/index.html"
  fi
}

main "$@"
