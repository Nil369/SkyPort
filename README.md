<img width="1000" height="300" alt="SKY_PORT_LOGO_BANNER_1" src="https://github.com/user-attachments/assets/472ceeb6-daef-4067-b2c0-f2575ab9ee1a" />

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
___
<br/><br/>

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
