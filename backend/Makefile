APP=skyport
VERSION?=0.0.1
COMMIT?=$(shell git rev-parse --short HEAD 2>/dev/null || echo dev)
BUILD_TIME?=$(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
LDFLAGS=-s -w -X skyport/internal/version.Version=$(VERSION)

PLATFORMS=linux/amd64 linux/arm64 windows/amd64 darwin/amd64 darwin/arm64

.PHONY: build-all test clean

.PHONY: swag-init install-swag docs

build-all:
	@for p in $(PLATFORMS); do \
		GOOS=$${p%/*} GOARCH=$${p#*/} go build -trimpath -ldflags "$(LDFLAGS)" -o ../bin/$${p%/*}-$${p#*/}/$(APP)$$( [ "$${p%/*}" = "windows" ] && echo .exe ) ./cmd/server ; \
	done

test:
	go test ./...

install-swag:
	go install github.com/swaggo/swag/cmd/swag@latest

swag-init:
	# Generates OpenAPI docs into internal/docs (requires `swag`)
	@swag init -g cmd/server/main.go -o internal/docs

docs: install-swag swag-init
	@echo "Swagger docs generated in internal/docs"

clean:
	rm -rf ../bin
