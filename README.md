<img width="1000" height="300" alt="SKY_PORT_LOGO_BANNER_1" src="https://github.com/user-attachments/assets/472ceeb6-daef-4067-b2c0-f2575ab9ee1a" />

# SkyPort

**The Lightweight Developer Cloud OS**

> Self-hosted infrastructure for developers who want a calm, modern control plane on a small VPS—without sacrificing ambition.

---

## Vision

SkyPort aims to become a **lightweight, beautiful, self-hosted developer cloud**—optimized for **512MB–1GB class VPS instances**, **single-command setup**, and **developer-first workflows** (code, ship, observe, repeat).

We believe teams and solo builders should own their runtime, data, and UX—whether they deploy on a $5 instance or a rack of machines—without fighting heavyweight control planes.

---

## Why SkyPort?

- **Small footprint** — Designed with low RAM and single-binary ergonomics in mind.
- **Honest scope** — We’re building in public; you’ll always know what works today vs. what’s on the roadmap.
- **Modern stack** — Go + Fiber API, SQLite + GORM for persistence, React + TypeScript for the UI.
- **Self-host first** — Your machine, your rules; optional Pro/Enterprise layers may arrive later without locking out the community edition.
- **Open-core friendly** — Community AGPLv3 today; future commercial editions will be clearly separated (see [NOTICE](./NOTICE)).

---

# 📸 Screenshots

## Backend API Docs:

<img width="1314" height="915" alt="image" src="https://github.com/user-attachments/assets/eded94ba-aec2-4478-bc82-f4cfb91145e2" />

## Dashboard After Booting Up and Login:

### 1.Overview:

<img width="1919" height="913" alt="image" src="https://github.com/user-attachments/assets/9090692d-e09b-4425-925c-8fd9fae4e932" />

### 2. Dark Mode & File System (No Need of FTP Clients):
<img width="1919" height="916" alt="image" src="https://github.com/user-attachments/assets/cefd2731-e241-4117-9133-f4abc4304be1" />

### 3. Virual Terminal:
<img width="1919" height="907" alt="image" src="https://github.com/user-attachments/assets/3add198a-99db-4373-83d0-8620c01647b3" />

### 4. Pull Your Project From Github (Even Private One!)
<img width="1911" height="906" alt="image" src="https://github.com/user-attachments/assets/b49af8d0-f774-42fe-8b7d-7806c0db7157" />

### 5. Docker & Container Orchestration(Coming Soon)
<img width="1905" height="894" alt="image" src="https://github.com/user-attachments/assets/2a442769-9513-4315-bd04-9423bca2067c" />

### 6. PM2 Process manager for low-end VPS (512MB ram constraint!)
<img width="1919" height="911" alt="image" src="https://github.com/user-attachments/assets/982567c3-2ee7-496a-ab78-8caabd257894" />

---

## Tech stack

| Layer | Technologies |
|--------|----------------|
| API | Go, [Fiber](https://gofiber.io/), REST, WebSockets (metrics stream) |
| Data | SQLite, [GORM](https://gorm.io/) |
| Frontend | React, TypeScript, [Vite](https://vitejs.dev/) |
| Metrics | [gopsutil](https://github.com/shirou/gopsutil) *(host metrics — in development)* |

---

## Development setup

**Prerequisites**

- **Go** 1.22+
- **Node.js** 20+ (or current LTS) and **npm** for the frontend

Clone the repository and open two terminals (API + UI).

---

## Environment variables

Copy [.env.example](./.env.example) to `backend/.env` and adjust values.

| Variable | Purpose |
|----------|---------|
| `SKYPORT_HOST` / `SKYPORT_PORT` | HTTP bind address |
| `SKYPORT_DB_PATH` | SQLite file path |
| `SKYPORT_ENV` | `development` · `production` · `test` |
| `SKYPORT_LOG_LEVEL` | `debug` · `info` · `warn` · `error` |
| `SKYPORT_SHUTDOWN_TIMEOUT_SEC` | Graceful shutdown budget (seconds) |
| `SKYPORT_METRICS_DISK_PATH` | Optional disk mount for usage stats |
| `JWT_EXPIRES` | JWT access token TTL in seconds (default `604800` = 7 days) |
| `APP_*` / `JWT_SECRET` | Reserved for frontend + future auth alignment |

See `.env.example` for the full list and comments.

---

## Running the backend

```bash
cd backend
cp ../.env.example .env   # optional; edit SKYPORT_PORT etc.
go run ./cmd/server
```

The server prints a local URL (e.g. `http://127.0.0.1:<port>/api/v1/health`). Ensure **the port in the browser matches** `SKYPORT_PORT`.

Swagger UI:

- `http://127.0.0.1:8080/docs/index.html`
- Generate/refresh OpenAPI docs before commits:

```bash
cd backend
make docs
```

**Build a binary**

```bash
cd backend
go build -o bin/skyport ./cmd/server
./bin/skyport    # Linux/macOS
# bin\skyport.exe on Windows
```

Cross-platform release builds:

```bash
cd backend
make build-all               # binaries only
make build-all-with-docs     # regenerate swagger + binaries
```

Platform scripts:

- Linux/macOS: `GENERATE_DOCS=1 sh ./scripts/build.sh`
- PowerShell: `$env:GENERATE_DOCS="1"; ./scripts/build.ps1`
- CMD: `set GENERATE_DOCS=1 && scripts\build.bat`

---

## Running the frontend

```bash
cd frontend
npm install
npm run dev
```

Vite defaults to its own port (often `5173`). The UI is **not** yet a full dashboard; expect placeholder screens until monitoring and layout land.

---

## API examples

**Health**

```bash
curl -s http://127.0.0.1:8080/api/v1/health | jq .
```

Example response:

```json
{
  "status": "ok",
  "service": "skyport",
  "version": "0.0.1"
}
```

**Metrics** *(under active development; schema may evolve)*

```bash
curl -s http://127.0.0.1:8080/api/v1/metrics | jq .
```

**WebSockets** *(metrics & terminal)*

SkyPort exposes two WebSocket channels:

- `ws://<host>:<port>/ws/metrics` — push-only metrics stream (JSON snapshots every 2s). Use this for realtime host monitoring.
- `ws://<host>:<port>/ws/terminal` — interactive shell session (PTY over WebSocket). Requires a valid JWT (see auth) and supports a small JSON control message to resize the PTY:

  Resize example (Text frame):

  ```json
  {"type":"resize","cols":80,"rows":24}
  ```

Authentication: provide a JWT either as `?token=<JWT>` query param, via an `Authorization: Bearer <JWT>` header, or in the `Sec-WebSocket-Protocol` header for clients that prefer sending protocols. Example `wscat` usage:

```bash
# Metrics (no write expected back):
wscat -c "ws://127.0.0.1:8080/ws/metrics?token=$TOKEN"

# Terminal (interactive):
wscat -c "ws://127.0.0.1:8080/ws/terminal?token=$TOKEN"
```

Swagger groups both routes under `Websocket`, but the UI cannot perform a real WebSocket upgrade. Use a WebSocket client such as `wscat`, a browser client, or Postman WebSocket tab.

Terminal socket reliability:

- SkyPort now sends periodic WS ping frames and extends read deadlines on pong/messages to reduce idle disconnects during long sessions.

Postman tip: if header auth is stripped during upgrade, pass JWT through either:

- query: `ws://127.0.0.1:8080/ws/terminal?token=<JWT>`
- `Sec-WebSocket-Protocol: jwt,<JWT>` (server now negotiates `jwt` subprotocol)

---

## Docker helper routes

SkyPort now includes lightweight Docker control APIs:

- `GET /api/v1/docker/status`
- `POST /api/v1/docker/install` (returns OS-specific install command)
- `POST /api/v1/docker/start`
- `POST /api/v1/docker/stop`
- `POST /api/v1/docker/daemon` (`start|stop|restart`)
- `GET /api/v1/docker/images`
- `DELETE /api/v1/docker/image/:name`
- `POST /api/v1/docker/images/prune`
- `GET /api/v1/docker/volumes`
- `DELETE /api/v1/docker/volume/:name`
- `POST /api/v1/docker/volumes/prune`

If Docker is installed but not on PATH, SkyPort tries common binary locations automatically.

---

## Filesystem APIs (absolute paths)

The filesystem module works with absolute paths on the host/VPS:

- `GET /api/v1/files?path=/abs/path`
- `POST /api/v1/files/folder`
- `POST /api/v1/files/file`
- `PUT /api/v1/files/write` (`utf8` or `base64`)
- `POST /api/v1/files/upload` (`multipart: path + file`)
- `GET /api/v1/files/download?path=/abs/file`
- `POST /api/v1/files/read` (auto-detects binary and returns base64 preview)
- `PATCH /api/v1/files/rename`
- `DELETE /api/v1/files?path=/abs/path`

Windows path note:

- In JSON, either escape backslashes (`G:\\data\\test.txt`) or use forward slashes (`G:/data/test.txt`).
- Unescaped `\t` / `\n` sequences become control characters and will be rejected.

Directory downloads:

- `GET /api/v1/files/download?path=/abs/folder` now returns a zip archive.

---

## Git helper routes

- `GET /api/v1/system/git/status`
- `POST /api/v1/system/git/install` (`{"execute": true}` for one-click install attempt)

---

## Open-core philosophy

SkyPort is **AGPLv3** today so self-hosters always have source, fork rights, and community leverage. We may later offer **Pro** or **Enterprise** products (hosting, support, or closed add-ons). Those will be **clearly separated** from the community tree; the **community edition is meant to stay open**. See [NOTICE](./NOTICE).

---

## Why AGPLv3?

SkyPort is a **network-facing developer platform**. AGPLv3 helps ensure that operators who modify the software and run it as a service **share improvements back** with the community—aligning incentives for long-term sustainability while still allowing aggressive self-hosting and experimentation.

If AGPL is a blocker for your organization, reach out via discussions; we’re open to **separate commercial licensing** for Pro/Enterprise offerings when they exist.

---

## 🤝Contributing

We love early contributors—especially docs, DX, and small API improvements.

1. **Open an issue** first for larger changes (architecture, new subsystems).
2. **Fork** → branch → **PR** with a clear description and test notes (`go test ./...`, manual curl checks).
3. Keep commits focused; match existing Go / TS style.
4. Be kind; we’re a small project—constructive review makes everyone faster.

---

## 🔒Security

**Please do not** open public issues for undisclosed vulnerabilities.

- Report sensitive issues privately to the maintainers (enable **Security** → **Private vulnerability reporting** on GitHub when available, or use maintainer contact from the repo profile).
- Include repro steps, impact, and suggested severity.
- We aim to acknowledge within a few business days for valid reports.

---

## Community & discussions

- **GitHub Discussions** — roadmap, ideas, and support threads *(enable in repo settings if not already on)*.
- **Issues** — bugs and concrete feature proposals.
- **PRs** — always welcome for docs and code.

---

## Future plans

- Ship a **credible v0.1**: health + metrics + minimal dashboard read-only views.
- Harden **auth** (JWT), **RBAC**, and **audit logging**.
- Layer **terminal**, **files**, **Docker**, and **deploy** modules behind clear API boundaries.
- Publish **install scripts** and opinionated **VPS images** once APIs stabilize.

---

## Credits

**SkyPort** is initiated and maintained by Akash Halder (Nil369), Founder of **Akash Halder Technologia** as the brand home for the project.  

Thank you to everyone who files issues, sends patches, and self-hosts early builds—you shape what SkyPort becomes.

---

## 📄License

Copyright © **Nil369**, Founder of  ***Akash Halder Technologia*** and contributors.

Licensed under the **GNU Affero General Public License v3.0**. See [LICENSE](./LICENSE).

---

## 🙏 Support the project

If SkyPort saves you time or infra cost:

- Star the repo and **watch** releases.
- Share honest feedback (what hurts on a 512MB box matters).
- Contribute docs, translations, or code.
- When Pro/Enterprise exists, consider them if you need **commercial licensing** or **priority support**—the community edition remains the AGPL backbone.

---
