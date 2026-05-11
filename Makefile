# SkyPort - root build orchestration (frontend embed + Go binary).
#
# Windows note: `npm ci` deletes all of node_modules and often hits EPERM on native DLLs.
#   Default here uses `npm install` (in-place). For CI-clean installs use:
#     make frontend-build FRONTEND_USE_CI=1
# To cross-compile without touching Node at all (uses committed embed placeholder or prior sync):
#     make cross-compile

VERSION         ?= 0.0.1
FRONTEND_DIR    := frontend
BACKEND_DIR     := backend

# 1 = npm ci (CI). 0 or unset = npm install (fewer Windows file-lock issues).
FRONTEND_USE_CI ?= 0

ifeq ($(FRONTEND_USE_CI),1)
  FRONTEND_NPM_PREP := npm ci
else
  FRONTEND_NPM_PREP := npm install
endif

.PHONY: help frontend-build frontend-sync cross-compile backend-build build-all release

help:
	@echo "Targets:"
	@echo "  frontend-build   - $(FRONTEND_NPM_PREP) + vite build + sync embed dirs (FRONTEND_USE_CI=1 for npm ci)"
	@echo "  frontend-sync    - copy $(FRONTEND_DIR)/dist -> embed dirs only (no npm)"
	@echo "  cross-compile    - Go cross-build only (no npm; needs internal/frontend/dist)"
	@echo "  backend-build    - native Go binary for this machine"
	@echo "  build-all        - frontend-build then cross-compile"
	@echo "  release          - same as build-all"

# 1) npm  2) vite build  3) copy dist for go:embed + backend/web/dist mirror
frontend-build:
	cd $(FRONTEND_DIR) && $(FRONTEND_NPM_PREP) && npm run build
	$(MAKE) frontend-sync

# Copy an existing Vite dist (after manual npm run build).
# Windows: Scoop/CMD make has no `test`/`cp`; use PowerShell sync script.
ifeq ($(OS),Windows_NT)
frontend-sync:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sync-embed-ui.ps1
else
frontend-sync:
	@test -d $(FRONTEND_DIR)/dist || (echo "ERROR: missing $(FRONTEND_DIR)/dist - run npm run build in frontend first." && false)
	rm -rf $(BACKEND_DIR)/internal/frontend/dist $(BACKEND_DIR)/web/dist
	mkdir -p $(BACKEND_DIR)/internal/frontend/dist $(BACKEND_DIR)/web/dist
	cp -r $(FRONTEND_DIR)/dist/. $(BACKEND_DIR)/internal/frontend/dist/
	cp -r $(FRONTEND_DIR)/dist/. $(BACKEND_DIR)/web/dist/
endif

backend-build:
	$(MAKE) -C $(BACKEND_DIR) build VERSION=$(VERSION)

# Cross-compile every OS/arch (no Node). Uses whatever is in backend/internal/frontend/dist.
cross-compile:
	$(MAKE) -C $(BACKEND_DIR) build-all VERSION=$(VERSION)

build-all: frontend-build cross-compile

release: build-all
