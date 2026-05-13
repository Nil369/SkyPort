APP          := skyport-server
VERSION      ?= 0.0.1
ifeq ($(OS),Windows_NT)
# GNU Make on Windows often uses cmd.exe for $(shell); use cmd-friendly redirection.
COMMIT       ?= $(shell git rev-parse --short HEAD 2>nul || echo dev)
BUILD_TIME   ?= $(shell powershell -NoProfile -Command "[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')")
else
COMMIT       ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "dev")
BUILD_TIME   ?= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
endif

# Use recursive assignment (=) for LDFLAGS so variables like BUILD_TIME 
# are evaluated at execution, not just at startup.
LDFLAGS      = -s -w \
               -X skyport/internal/version.Version=$(VERSION) \
               -X skyport/internal/version.Commit=$(COMMIT) \
               -X skyport/internal/version.BuildTime=$(BUILD_TIME)

PLATFORMS    := linux/amd64 linux/arm64 windows/amd64 darwin/amd64 darwin/arm64

.PHONY: build build-all build-all-with-docs test clean swag-init docs release

# Single native binary (default output: ../bin/server/skyport-server[.exe])
build:
ifeq ($(OS),Windows_NT)
	@powershell -NoProfile -Command "New-Item -ItemType Directory -Force -Path '..\\bin\\server' | Out-Null"
	go build -trimpath -ldflags "$(LDFLAGS)" -o ../bin/server/$(APP).exe ./cmd/server
else
	@mkdir -p ../bin/server
	go build -trimpath -ldflags "$(LDFLAGS)" -o ../bin/server/$(APP) ./cmd/server
endif

build-all:
ifeq ($(OS),Windows_NT)
	@echo "Windows detected: using scripts/build.ps1"
	@powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1
else
	@echo "Building $(APP) for multiple platforms..."
	@for p in $(PLATFORMS); do \
		OS=$${p%/*}; \
		ARCH=$${p#*/}; \
		EXT=$$( [ "$$OS" = "windows" ] && echo ".exe" || echo "" ); \
		OUT_DIR="../bin/server/$$OS-$$ARCH"; \
		mkdir -p $$OUT_DIR; \
		echo "  -> $$OS/$$ARCH"; \
		rm -f cmd/server/resource.syso; \
		if [ "$$OS" = "windows" ] && [ -f ../assets/logo.ico ]; then \
			echo "     embedding ../assets/logo.ico"; \
			go run github.com/akavel/rsrc@v0.10.2 -ico ../assets/logo.ico -o cmd/server/resource.syso; \
		fi; \
		GOOS=$$OS GOARCH=$$ARCH go build -trimpath -ldflags "$(LDFLAGS)" -o $$OUT_DIR/$(APP)$$EXT ./cmd/server; \
		rm -f cmd/server/resource.syso; \
	done
endif

build-all-with-docs: swag-init build-all

test:
	go test -v -race ./...

swag-init:
	@echo "Generating Swagger documentation..."
	@go run github.com/swaggo/swag/cmd/swag@latest init \
		-g cmd/server/main.go \
		-o internal/docs \
		--parseDependency \
		--parseInternal

docs: swag-init
	@echo "Docs updated in internal/docs"

clean:
ifeq ($(OS),Windows_NT)
	powershell -NoProfile -Command "Remove-Item -Recurse -Force -ErrorAction SilentlyContinue ../bin"
else
	rm -rf ../bin
endif

# Release-quality cross-compiles (run from repo root `make release` so UI is embedded).
release: build-all
	@echo "release artifacts in ../bin/server/<GOOS>-<GOARCH>/"