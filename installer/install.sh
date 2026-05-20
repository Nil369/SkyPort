#!/usr/bin/env bash
set -Eeuo pipefail

#
# SkyPort Universal Installer
#
# Supports:
#   - Linux (systemd)
#   - macOS (launchd)
#

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
  LOG_DIR="/usr/local/var/log/skyport"
else
  INSTALL_DIR="/opt/skyport"
  CONFIG_DIR="/etc/skyport"
  LOG_DIR="/var/log/skyport"
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
    error "Please run using sudo."
  fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || error "Missing command: $1"
}

# =========================================================
# DETECT
# =========================================================

detect_os() {
  case "$(uname -s | tr '[:upper:]' '[:lower:]')" in
    linux) echo "linux" ;;
    darwin) echo "darwin" ;;
    *) error "Unsupported OS" ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "amd64" ;;
    aarch64|arm64) echo "arm64" ;;
    *) error "Unsupported architecture" ;;
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
  echo "https://github.com/${SKYPORT_REPO}/releases/download/$1/skyport-server-$2-$3"
}

cli_url() {
  echo "https://github.com/${SKYPORT_REPO}/releases/download/$1/skyport-$2-$3"
}

# =========================================================
# USER
# =========================================================

create_user() {

  if [ "$(detect_os)" = "darwin" ]; then
    return
  fi

  if id -u skyport >/dev/null 2>&1; then
    log "User already exists."
    return
  fi

  log "Creating skyport user..."

  useradd \
    --system \
    --home "${INSTALL_DIR}" \
    --shell /usr/sbin/nologin \
    --create-home \
    skyport
}

# =========================================================
# DIRECTORIES
# =========================================================

create_directories() {

  log "Creating directories..."

  mkdir -p "${INSTALL_DIR}"
  mkdir -p "${DATA_DIR}"
  mkdir -p "${WORKSPACE_DIR}"
  mkdir -p "${CONFIG_DIR}"
  mkdir -p "${LOG_DIR}"

  chmod 755 "${INSTALL_DIR}"
  chmod 755 "${DATA_DIR}"
  chmod 755 "${WORKSPACE_DIR}"

  if [ "$(detect_os)" = "linux" ]; then
    chown -R skyport:skyport "${INSTALL_DIR}"
    chown -R skyport:skyport "${LOG_DIR}"
  fi
}

# =========================================================
# ENV
# =========================================================

generate_secret() {
  tr -dc A-Za-z0-9 </dev/urandom | head -c 64
}

write_env() {

  log "Generating environment file..."

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

APP_ID=3771772
APP_PRIVATE_KEY=""

ALLOWED_ORIGINS=*
TRUSTED_PROXIES=127.0.0.1,::1
EOF

  chmod 600 "${ENV_FILE}"

  if [ "$(detect_os)" = "linux" ]; then
    chown skyport:skyport "${ENV_FILE}"
  fi
}

# =========================================================
# DOWNLOAD
# =========================================================

install_server() {

  local url
  url="$(server_url "$1" "$2" "$3")"

  log "Downloading server..."
  curl -fL "$url" -o "${SERVER_BIN}"

  chmod +x "${SERVER_BIN}"

  [ -f "${SERVER_BIN}" ] || error "Server install failed."
}

install_cli() {

  local url
  url="$(cli_url "$1" "$2" "$3")"

  log "Downloading CLI..."
  curl -fL "$url" -o "${CLI_BIN}"

  chmod +x "${CLI_BIN}"

  [ -f "${CLI_BIN}" ] || error "CLI install failed."
}

# =========================================================
# SYSTEMD (LINUX)
# =========================================================

install_systemd_service() {

  log "Installing systemd service..."

cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=SkyPort Backend
After=network.target

[Service]
Type=simple

User=skyport
Group=skyport

WorkingDirectory=${INSTALL_DIR}

EnvironmentFile=-${ENV_FILE}
Environment=PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

ExecStart=${SERVER_BIN}

Restart=always
RestartSec=3

StartLimitInterval=60
StartLimitBurst=10

StandardOutput=journal
StandardError=journal

NoNewPrivileges=true
PrivateTmp=true

LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

  chmod 644 "${SERVICE_FILE}"

  log "Reloading systemd..."
  systemctl daemon-reload

  log "Enabling service..."
  systemctl enable skyport

  log "Starting service..."
  systemctl restart skyport

  sleep 3

  if systemctl is-active --quiet skyport; then
    log "SkyPort service started successfully."
  else
    log "SkyPort service failed."
    journalctl -u skyport -n 50 --no-pager || true
    exit 1
  fi
}

# =========================================================
# LAUNCHD (MACOS)
# =========================================================

install_launchd_service() {

  log "Installing launchd service..."

cat > "${LAUNCHD_FILE}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
"http://www.apple.com/DTDs/PropertyList-1.0.dtd">

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

    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>

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
  <string>${LOG_DIR}/skyport.log</string>

  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/skyport-error.log</string>

</dict>
</plist>
EOF

  chmod 644 "${LAUNCHD_FILE}"

  launchctl unload "${LAUNCHD_FILE}" >/dev/null 2>&1 || true

  launchctl load "${LAUNCHD_FILE}"

  sleep 3

  if launchctl list | grep -q "in.skyport.server"; then
    log "SkyPort launchd service started successfully."
  else
    log "SkyPort launchd service failed."
    exit 1
  fi
}

# =========================================================
# HEALTH CHECK
# =========================================================

verify_health() {

  log "Running health check..."

  sleep 3

  if curl -fsS "http://127.0.0.1:${SKYPORT_PORT}/api/v1/health" >/dev/null; then
    log "Health check passed."
  else
    log "Health check failed."

    if [ "$(detect_os)" = "linux" ]; then
      journalctl -u skyport -n 50 --no-pager || true
    fi
  fi
}

# =========================================================
# IP
# =========================================================

primary_ip() {

  if [ "$(detect_os)" = "darwin" ]; then
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

  [ -n "${version}" ] || error "Failed to resolve version."

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
    verify_health
  fi

  if [ "${os}" = "darwin" ]; then
    install_launchd_service
    verify_health
  fi

  local ip
  ip="$(primary_ip)"

  echo
  echo "=================================================="
  echo " SkyPort Installed Successfully"
  echo "=================================================="
  echo
  echo "Dashboard:"
  echo "  http://${ip}:${SKYPORT_PORT}"
  echo
  echo "Swagger:"
  echo "  http://${ip}:${SKYPORT_PORT}/docs/index.html"
  echo
  echo "Health:"
  echo "  http://${ip}:${SKYPORT_PORT}/api/v1/health"
  echo

  if [ "${os}" = "linux" ]; then
    echo "Logs:"
    echo "  journalctl -u skyport -f"
    echo
    echo "Status:"
    echo "  systemctl status skyport"
  fi

  if [ "${os}" = "darwin" ]; then
    echo "Logs:"
    echo "  tail -f ${LOG_DIR}/skyport.log"
    echo
    echo "Status:"
    echo "  launchctl list | grep skyport"
  fi

  echo
}

main "$@"