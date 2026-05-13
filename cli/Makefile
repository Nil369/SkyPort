APP          := skyport
BIN_DIR      := $(abspath ../bin/cli)
BIN_DIR_WIN  := $(subst /,\,$(BIN_DIR))
VERSION      ?= 0.0.1
COMMIT       ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "dev")
BUILD_TIME   ?= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")

LDFLAGS      = -s -w \
		       -X skyport-cli/internal/version.Version=$(VERSION) \
		       -X skyport-cli/internal/version.Commit=$(COMMIT) \
		       -X skyport-cli/internal/version.BuildTime=$(BUILD_TIME)

PLATFORMS    := linux/amd64 linux/arm64 windows/amd64 darwin/amd64 darwin/arm64

.PHONY: build build-all clean

build:
ifeq ($(OS),Windows_NT)
	@cmd /c if not exist "$(BIN_DIR_WIN)" mkdir "$(BIN_DIR_WIN)"
	go build -trimpath -ldflags "$(LDFLAGS)" -o $(BIN_DIR_WIN)\$(APP).exe .
else
	@mkdir -p ../bin/cli
	go build -trimpath -ldflags "$(LDFLAGS)" -o ../bin/cli/$(APP) .
endif

build-all:
ifeq ($(OS),Windows_NT)
	@echo "Windows detected: using direct cross compile"
	@powershell -NoProfile -Command "$platforms=@('linux/amd64','linux/arm64','windows/amd64','darwin/amd64','darwin/arm64'); foreach($p in $platforms){ $parts=$p.Split('/'); $os=$parts[0]; $arch=$parts[1]; $ext= if($os -eq 'windows'){'.exe'} else {''}; $out='..\\bin\\' + $os + '-' + $arch; New-Item -ItemType Directory -Force -Path $out | Out-Null; $env:GOOS=$os; $env:GOARCH=$arch; go build -trimpath -ldflags '$(LDFLAGS)' -o ($out + '\\$(APP)' + $ext) .; Remove-Item Env:GOOS,Env:GOARCH -ErrorAction SilentlyContinue }"
else
	@mkdir -p ../bin/cli
	@for p in $(PLATFORMS); do \
		OS=$${p%/*}; \
		ARCH=$${p#*/}; \
		EXT=$$( [ "$$OS" = "windows" ] && echo ".exe" || echo "" ); \
		OUT_DIR="../bin/cli/$$OS-$$ARCH"; \
		mkdir -p $$OUT_DIR; \
		GOOS=$$OS GOARCH=$$ARCH go build -trimpath -ldflags "$(LDFLAGS)" -o $$OUT_DIR/$(APP)$$EXT .; \
	done
endif

clean:
ifeq ($(OS),Windows_NT)
	powershell -NoProfile -Command "Remove-Item -Recurse -Force -ErrorAction SilentlyContinue ../bin"
else
	rm -rf ../bin
endif
