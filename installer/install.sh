#!/usr/bin/env bash
set -Eeuo pipefail

#
# SkyPort Universal Installer
#
# Installs:
#   - skyport-server
#   - skyport CLI
#   - systemd service (Linux)
#   - launchd service (macOS)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Nil369/SkyPort/main/installer/install.sh | sudo bash
#
# Optional:
#   SKYPORT_REPO="Nil369/SkyPort"
#   SKYPORT_VERSION="latest"
#   SKYPORT_PORT="8080"
#   SKYPORT_HOST="0.0.0.0"

# =========================================================
# CONFIG
# =========================================================

SKYPORT_REPO="${SKYPORT_REPO:-Nil369/SkyPort}"
SKYPORT_VERSION="${SKYPORT_VERSION:-latest}"

SKYPORT_HOST="${SKYPORT_HOST:-0.0.0.0}"
SKYPORT_PORT="${SKYPORT_PORT:-8080}"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"

if [ "$OS" = "darwin" ]; then
  INSTALL_DIR="/usr/local/skyport"
  CONFIG_DIR="/usr/local/etc/skyport"
else
  INSTALL_DIR="/opt/skyport"
  CONFIG_DIR="/etc/skyport"
fi

DATA_DIR="${INSTALL_DIR}/data"
WORKSPACE_DIR="${INSTALL_DIR}/workspace"

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

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || error "Missing required command: $1"
}

# =========================================================
# DETECT OS
# =========================================================

detect_os() {
  local os
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"

  case "$os" in
    linux)
      echo "linux"
      ;;
    darwin)
      echo "darwin"
      ;;
    *)
      error "Unsupported OS: $os"
      ;;
  esac
}

detect_arch() {
  local arch
  arch="$(uname -m)"

  case "$arch" in
    x86_64|amd64)
      echo "amd64"
      ;;
    aarch64|arm64)
      echo "arm64"
      ;;
    *)
      error "Unsupported architecture: $arch"
      ;;
  esac
}

# =========================================================
# RELEASE
# =========================================================

latest_release() {
  curl -fsSL "https://api.github.com/repos/${SKYPORT_REPO}/releases/latest" \
    | grep '"tag_name"' \
    | head -n1 \
    | sed -E 's/.*"([^"]+)".*/\1/'
}

server_url() {
  local version="$1"
  local os="$2"
  local arch="$3"

  echo "https://github.com/${SKYPORT_REPO}/releases/download/${version}/skyport-server-${os}-${arch}"
}

cli_url() {
  local version="$1"
  local os="$2"
  local arch="$3"

  echo "https://github.com/${SKYPORT_REPO}/releases/download/${version}/skyport-${os}-${arch}"
}

# =========================================================
# USER
# =========================================================

create_user() {

  if [ "$(detect_os)" = "darwin" ]; then
    return
  fi

  if id -u skyport >/dev/null 2>&1; then
    return
  fi

  log "Creating skyport user..."

  useradd \
    --system \
    --home "${INSTALL_DIR}" \
    --shell /usr/sbin/nologin \
    skyport || true
}

# =========================================================
# DIRECTORIES
# =========================================================

create_directories() {
  mkdir -p "${INSTALL_DIR}"
  mkdir -p "${DATA_DIR}"
  mkdir -p "${WORKSPACE_DIR}"
  mkdir -p "${CONFIG_DIR}"

  if [ "$(detect_os)" = "linux" ]; then
    chown -R skyport:skyport "${INSTALL_DIR}" || true
  fi
}

# =========================================================
# ENV
# =========================================================

generate_secret() {
  tr -dc A-Za-z0-9 </dev/urandom | head -c 48
}

write_env() {

  local jwt_secret
  jwt_secret="$(generate_secret)"

  cat > "${ENV_FILE}" <<EOF
SKYPORT_HOST=${SKYPORT_HOST}
SKYPORT_PORT=${SKYPORT_PORT}

SKYPORT_ENV=production
SKYPORT_LOG_LEVEL=info

SKYPORT_DB_PATH=${DATA_DIR}/skyport.db
SKYPORT_WORKSPACE_ROOT=${WORKSPACE_DIR}

JWT_SECRET=${jwt_secret}
JWT_EXPIRES=604800

ENABLE_TERMINAL=true
ENABLE_DOCKER=true
ENABLE_PROJECTS=true
ENABLE_METRICS=true
ENABLE_FILESYSTEM=true

ALLOWED_ORIGINS=*
TRUSTED_PROXIES=127.0.0.1,::1
EOF

  chmod 600 "${ENV_FILE}"
}

# =========================================================
# DOWNLOAD
# =========================================================

install_server() {

  local version="$1"
  local os="$2"
  local arch="$3"

  local url
  url="$(server_url "$version" "$os" "$arch")"

  log "Downloading server..."
  log "$url"

  curl -fL "$url" -o "${SERVER_BIN}"

  chmod +x "${SERVER_BIN}"
}

install_cli() {

  local version="$1"
  local os="$2"
  local arch="$3"

  local url
  url="$(cli_url "$version" "$os" "$arch")"

  log "Downloading CLI..."
  log "$url"

  curl -fL "$url" -o "${CLI_BIN}"

  chmod +x "${CLI_BIN}"
}

# =========================================================
# SYSTEMD (LINUX)
# =========================================================

install_systemd_service() {

cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=SkyPort
After=network.target

[Service]
Type=simple

User=skyport
Group=skyport

WorkingDirectory=${INSTALL_DIR}

EnvironmentFile=${ENV_FILE}

ExecStart=${SERVER_BIN}

Restart=always
RestartSec=3

NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable skyport
  systemctl restart skyport

  log "systemd service installed."
}

# =========================================================
# LAUNCHD (MACOS)
# =========================================================

install_launchd_service() {

cat > "${LAUNCHD_FILE}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>

  <key>Label</key>
  <string>in.skyport.server</string>

  <key>ProgramArguments</key>
  <array>
    <string>${SERVER_BIN}</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${INSTALL_DIR}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>SKYPORT_HOST</key>
    <string>${SKYPORT_HOST}</string>

    <key>SKYPORT_PORT</key>
    <string>${SKYPORT_PORT}</string>

    <key>SKYPORT_ENV</key>
    <string>production</string>

    <key>SKYPORT_LOG_LEVEL</key>
    <string>info</string>

    <key>SKYPORT_DB_PATH</key>
    <string>${DATA_DIR}/skyport.db</string>

    <key>SKYPORT_WORKSPACE_ROOT</key>
    <string>${WORKSPACE_DIR}</string>

    <key>JWT_SECRET</key>
    <string>$(generate_secret)</string>

    <key>JWT_EXPIRES</key>
    <string>604800</string>

    <key>ENABLE_TERMINAL</key>
    <string>true</string>

    <key>ENABLE_DOCKER</key>
    <string>true</string>

    <key>ENABLE_PROJECTS</key>
    <string>true</string>

    <key>ENABLE_METRICS</key>
    <string>true</string>

    <key>ENABLE_FILESYSTEM</key>
    <string>true</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/var/log/skyport.log</string>

  <key>StandardErrorPath</key>
  <string>/var/log/skyport-error.log</string>

</dict>
</plist>
EOF

  chmod 644 "${LAUNCHD_FILE}"

  launchctl unload "${LAUNCHD_FILE}" >/dev/null 2>&1 || true
  launchctl load "${LAUNCHD_FILE}"

  log "launchd service installed."
}

# =========================================================
# IP
# =========================================================

primary_ip() {

  local os
  os="$(detect_os)"

  if [ "$os" = "darwin" ]; then
    ipconfig getifaddr en0 2>/dev/null \
      || ipconfig getifaddr en1 2>/dev/null \
      || echo "localhost"
    return
  fi

  hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost"
}

# =========================================================
# MAIN
# =========================================================

main() {

  require_root

  require_cmd curl

  local os
  local arch
  local version

  os="$(detect_os)"
  arch="$(detect_arch)"

  if [ "${SKYPORT_VERSION}" = "latest" ]; then
    log "Fetching latest release..."
    version="$(latest_release)"
  else
    version="${SKYPORT_VERSION}"
  fi

  [ -n "${version}" ] || error "Could not resolve release version."

  log "Installing SkyPort ${version}"
  log "OS: ${os}"
  log "ARCH: ${arch}"

  create_user

  create_directories

  install_server "${version}" "${os}" "${arch}"

  install_cli "${version}" "${os}" "${arch}"

  write_env

  if [ "${os}" = "linux" ] && command -v systemctl >/dev/null 2>&1; then
    install_systemd_service
  fi

  if [ "${os}" = "darwin" ]; then
    install_launchd_service
  fi

  local ip
  ip="$(primary_ip)"

  echo
  echo "===================================================="
  echo " SkyPort Installed Successfully"
  echo "===================================================="
  echo
  echo "Server Binary:"
  echo "  ${SERVER_BIN}"
  echo
  echo "CLI Binary:"
  echo "  ${CLI_BIN}"
  echo
  echo "Web UI:"
  echo "  http://${ip}:${SKYPORT_PORT}"
  echo
  echo "Swagger:"
  echo "  http://${ip}:${SKYPORT_PORT}/docs/index.html"
  echo
  echo "CLI Examples:"
  echo "  skyport login"
  echo "  skyport start webui"
  echo "  skyport start tui"
  echo "  skyport projects"
  echo
  echo "Service Status:"

  if [ "${os}" = "linux" ]; then
    echo "  systemctl status skyport"
  fi

  if [ "${os}" = "darwin" ]; then
    echo "  launchctl list | grep skyport"
  fi

  echo
}

main "$@"