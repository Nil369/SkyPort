#!/usr/bin/env bash
set -euo pipefail

# SkyPort installer: server + CLI from the latest GitHub release (or local bin/ when present).
# No Node.js or Go required for end users.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Nil369/SkyPort/main/installer/install.sh | sudo bash
#
# Local / WSL dev: build with `make build-all` (or root `make release`), then from repo root:
#   sudo bash installer/install.sh
# Binaries are picked up from ./bin when they match this machine OS/arch (see SKYPORT_LOCAL_BIN_ROOT).
#
# Optional env overrides:
#   SKYPORT_REPO="Nil369/SkyPort"
#   SKYPORT_VERSION="v0.0.1"   # or "latest" (default)
#   SKYPORT_LOCAL_BIN_ROOT="/path/to/repo/bin"   # force local artifacts (server + cli layout below)
#   SKYPORT_PORT="8080"
#   SKYPORT_HOST="0.0.0.0"
#   SKYPORT_PUBLIC_URL="https://skyport.example.com"
#   ALLOWED_ORIGINS / JWT_SECRET / JWT_EXPIRES / TRUSTED_PROXIES / ENABLE_* module flags

SKYPORT_REPO="${SKYPORT_REPO:-Nil369/SkyPort}"
SKYPORT_VERSION="${SKYPORT_VERSION:-latest}"

SKYPORT_HOST="${SKYPORT_HOST:-0.0.0.0}"
SKYPORT_PORT="${SKYPORT_PORT:-8080}"
SKYPORT_PUBLIC_URL="${SKYPORT_PUBLIC_URL:-}"

INSTALL_DIR="/opt/skyport"
DATA_DIR="${INSTALL_DIR}/data"
WORKSPACE_DIR="${INSTALL_DIR}/workspace"
CONFIG_DIR="/etc/skyport"
SERVER_BIN="${SERVER_BIN:-/usr/local/bin/skyport-server}"
CLI_BIN="${CLI_BIN:-/usr/local/bin/skyport}"
ENV_PATH="${CONFIG_DIR}/skyport.env"
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
    *) die "unsupported OS: $os (installer supports linux/darwin; for Windows, use release assets from GitHub)." ;;
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

binary_ext_for_os() {
  case "$1" in
    windows) echo ".exe" ;;
    *) echo "" ;;
  esac
}

# Prefer explicit SKYPORT_LOCAL_BIN_ROOT; else repo ./bin when install.sh lives in <repo>/installer/.
default_local_bin_root() {
  if [ -n "${SKYPORT_LOCAL_BIN_ROOT:-}" ]; then
    echo "${SKYPORT_LOCAL_BIN_ROOT}"
    return
  fi
  local inst_dir root bin
  inst_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  root="$(cd "${inst_dir}/.." && pwd)"
  bin="${root}/bin"
  if [ -d "$bin" ]; then
    echo "$bin"
    return
  fi
  if [ -d "${PWD}/bin" ]; then
    (cd "${PWD}" && pwd)/bin
    return
  fi
  echo ""
}

find_local_server() {
  local root="$1" os="$2" arch="$3"
  local ext
  ext="$(binary_ext_for_os "$os")"
  local f
  for f in \
    "${root}/server/${os}-${arch}/skyport-server${ext}" \
    "${root}/skyport-server-${os}-${arch}${ext}"; do
    if [ -f "$f" ]; then
      echo "$f"
      return 0
    fi
  done
  return 1
}

find_local_cli() {
  local root="$1" os="$2" arch="$3"
  local ext
  ext="$(binary_ext_for_os "$os")"
  local f
  for f in \
    "${root}/cli/${os}-${arch}/skyport${ext}" \
    "${root}/skyport-${os}-${arch}${ext}"; do
    if [ -f "$f" ]; then
      echo "$f"
      return 0
    fi
  done
  return 1
}

latest_tag() {
  curl -fsSL "https://api.github.com/repos/${SKYPORT_REPO}/releases/latest" \
    | grep -m 1 '"tag_name"' \
    | sed -E 's/.*"tag_name":[[:space:]]*"([^"]+)".*/\1/'
}

# Best-effort primary IPv4 for post-install URLs (Linux server / WSL).
primary_ip() {
  local ip=""
  if command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  if [ -z "${ip}" ] && command -v ip >/dev/null 2>&1; then
    ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit }}')"
  fi
  if [ -z "${ip}" ] && command -v ip >/dev/null 2>&1; then
    ip="$(ip -4 addr show scope global 2>/dev/null | awk '/inet / { sub(/\/.*/, "", $2); print $2; exit }')"
  fi
  echo "${ip}"
}

release_server_url() {
  local version="$1" os="$2" arch="$3"
  local ext
  ext="$(binary_ext_for_os "$os")"
  echo "https://github.com/${SKYPORT_REPO}/releases/download/${version}/skyport-server-${os}-${arch}${ext}"
}

release_cli_url() {
  local version="$1" os="$2" arch="$3"
  local ext
  ext="$(binary_ext_for_os "$os")"
  echo "https://github.com/${SKYPORT_REPO}/releases/download/${version}/skyport-${os}-${arch}${ext}"
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

default_allowed_origins() {
  local o="http://127.0.0.1:${SKYPORT_PORT},http://localhost:${SKYPORT_PORT}"
  if [ -n "${SKYPORT_PUBLIC_URL}" ]; then
    o="${SKYPORT_PUBLIC_URL},${o}"
  fi
  echo "${o}"
}

write_env() {
  mkdir -p "${CONFIG_DIR}"

  local jwt_secret="${JWT_SECRET:-}"
  if [ -z "${jwt_secret}" ]; then
    jwt_secret="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48)"
  fi

  local jwt_expires="${JWT_EXPIRES:-604800}"
  local allowed_origins="${ALLOWED_ORIGINS:-$(default_allowed_origins)}"

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
TRUSTED_PROXIES=${TRUSTED_PROXIES:-127.0.0.1,::1}

ENABLE_TERMINAL=${ENABLE_TERMINAL:-true}
ENABLE_METRICS=${ENABLE_METRICS:-true}
ENABLE_DOCKER=${ENABLE_DOCKER:-true}
ENABLE_FILESYSTEM=${ENABLE_FILESYSTEM:-true}
ENABLE_PROJECTS=${ENABLE_PROJECTS:-true}
EOF

  if [ -n "${SKYPORT_PUBLIC_URL}" ]; then
    echo "SKYPORT_PUBLIC_URL=${SKYPORT_PUBLIC_URL}" >>"${ENV_PATH}"
  fi

  chmod 600 "${ENV_PATH}"
}

install_server() {
  local version="$1" os="$2" arch="$3" local_root="${4:-}"
  local src url
  if [ -n "${local_root}" ] && src="$(find_local_server "${local_root}" "${os}" "${arch}")"; then
    log "installing server from local: ${src}"
    cp -f "${src}" "${SERVER_BIN}"
  else
    url="$(release_server_url "${version}" "${os}" "${arch}")"
    log "downloading server ${url}"
    curl -fsSL "${url}" -o "${SERVER_BIN}"
  fi
  chmod 755 "${SERVER_BIN}"
}

install_cli() {
  local version="$1" os="$2" arch="$3" local_root="${4:-}"
  local src url
  if [ -n "${local_root}" ] && src="$(find_local_cli "${local_root}" "${os}" "${arch}")"; then
    log "installing CLI from local: ${src}"
    cp -f "${src}" "${CLI_BIN}"
  else
    url="$(release_cli_url "${version}" "${os}" "${arch}")"
    log "downloading CLI ${url}"
    curl -fsSL "${url}" -o "${CLI_BIN}"
  fi
  chmod 755 "${CLI_BIN}"
}

install_service_linux() {
  mkdir -p "${INSTALL_DIR}" "${DATA_DIR}" "${WORKSPACE_DIR}" "${CONFIG_DIR}"
  chown -R skyport:skyport "${INSTALL_DIR}" || true

  cat >"${SERVICE_PATH}" <<EOF
[Unit]
Description=SkyPort
Documentation=https://github.com/${SKYPORT_REPO}
After=network.target

[Service]
Type=simple
User=skyport
Group=skyport
EnvironmentFile=${ENV_PATH}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${SERVER_BIN}
Restart=always
RestartSec=2
NoNewPrivileges=true

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

  local os arch version local_root
  os="$(detect_os)"
  arch="$(detect_arch)"

  if [ "${SKYPORT_VERSION}" = "latest" ]; then
    log "resolving latest release tag for ${SKYPORT_REPO}"
    version="$(latest_tag)"
    [ -n "${version}" ] || die "could not resolve latest release tag"
  else
    version="${SKYPORT_VERSION}"
  fi

  local_root="$(default_local_bin_root)"
  if [ -n "${local_root}" ]; then
    log "local bin directory: ${local_root} (missing pieces fall back to GitHub release ${version})"
  fi

  log "installing skyport ${version} (${os}-${arch})"
  create_user_if_needed
  mkdir -p "${INSTALL_DIR}" "${DATA_DIR}" "${WORKSPACE_DIR}" "${CONFIG_DIR}"

  install_server "${version}" "${os}" "${arch}" "${local_root}"
  install_cli "${version}" "${os}" "${arch}" "${local_root}"
  write_env

  local svr_host
  svr_host="$(primary_ip)"

  if [ "${os}" = "linux" ] && command -v systemctl >/dev/null 2>&1; then
    install_service_linux
    log "installed server -> ${SERVER_BIN}, CLI -> ${CLI_BIN}"
    if [ -n "${svr_host}" ]; then
      log "service running. UI + API: http://${svr_host}:${SKYPORT_PORT}/"
      log "API metadata: GET http://${svr_host}:${SKYPORT_PORT}/api"
      log "Swagger UI: http://${svr_host}:${SKYPORT_PORT}/docs/index.html"
    else
      log "service running. UI + API: http://<this-host-ip>:${SKYPORT_PORT}/"
      log "API metadata: GET http://<this-host-ip>:${SKYPORT_PORT}/api"
      log "Swagger UI: http://<this-host-ip>:${SKYPORT_PORT}/docs/index.html"
    fi
  else
    log "installed server -> ${SERVER_BIN}, CLI -> ${CLI_BIN}"
    log "run server: sudo ${SERVER_BIN}"
    log "CLI: ${CLI_BIN}"
    if [ -n "${svr_host}" ] && [ "${os}" = "linux" ]; then
      log "UI + API (after start): http://${svr_host}:${SKYPORT_PORT}/"
    else
      log "UI + API (after start): http://localhost:${SKYPORT_PORT}/"
    fi
  fi
}

main "$@"
