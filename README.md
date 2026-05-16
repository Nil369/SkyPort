<img width="1000" height="360" alt="SKY_PORT_LOGO_BANNER_1" src="https://github.com/user-attachments/assets/472ceeb6-daef-4067-b2c0-f2575ab9ee1a" />

# SkyPort

**The Lightweight Developer Cloud OS**

> Self-hosted infrastructure for developers who want a calm, modern control plane on a small VPS—without sacrificing ambition.


### Modern infrastructure management with:

- Browser terminal
- File manager
- Git deployments
- PM2 process management
- Docker orchestration
- Real-time monitoring
- Developer-first UI

***Built for small VPS (512MB - 1GB RAM) instances without sacrificing power.***

> Docker-based workloads are recommended on VPS instances with 2GB+ RAM for the best experience.


----
## 📃Read The Offical Skyport Docs

> *Visit the* **[Offical Docs Site](https://docs.skyport.akashhalder.in/)** for ***installation instructions, configuration, and detailed usage guides.***

| Skyport Docs Light | Skyport Docs Dark |
|---|---|
| ![](./assets/screenshots/skyport_docs.png) | ![](./assets/screenshots/skyport_docs_dark.png)|

___

<br/>

# 📸 Screenshots

| Overview | Projects |
|---|---|
| ![](./assets/screenshots/dashboard.png) | ![](./assets/screenshots/projects.png) |

| Deployments | Docker Management |
|---|---|
| ![](./assets/screenshots/deployment-pm2.png) | ![](./assets/screenshots/docker-start-images.png) |

| Code Editor | File Explorer |
|---|---|
| ![](./assets/screenshots/code-editor.png) |  ![](./assets/screenshots/file-explorer.png) |

| Terminal (Dark) | Terminal (Light) |
|---|---|
| ![](./assets/screenshots/terminal_dark.png) | ![](./assets/screenshots/terminal_light.png) |

| PM2 Process Management | Domain Management |
|---|---|
| ![](./assets/screenshots/pm2-manager.png) | ![](./assets/screenshots/domain_management.png) |

| System Metrics (CPU) | System Metrics (Memory) |
|---|---|
| ![](./assets/screenshots/system-metrics-cpu.png) | ![](./assets/screenshots/system-metrics-memory.png) |

| Marketplace | Marketplace Install |
|---|---|
| ![](./assets/screenshots/skyport-marketplace.png) | ![](./assets/screenshots/skyport-marketplace-install.png) |

| Team Management | Cluster / VPS Management |
|---|---|
| ![](./assets/screenshots/team_management.png) | ![](./assets/screenshots/cluster_management.png) |

| SSH Remote Server | Profile Management |
|---|---|
| ![](./assets/screenshots/ssh-remote-server.png) | ![](./assets/screenshots/profile_management.png) |

| Admin Panel
|---|
| ![](./assets/screenshots/admin_panel.png) | 

| Skyport CLI 🔥 | Skyport TUI 🧑‍💻|
|---|---|
| ![](./assets/screenshots/skyport_cli.png) | ![](./assets/screenshots/skyport_tui.png) |
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
go build -o bin/skyport-server ./cmd/server
./bin/skyport-server    # Linux/macOS
# bin\skyport-server.exe on Windows
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

## 💳 Credits

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
