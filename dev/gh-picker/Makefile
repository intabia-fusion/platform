# gh-picker Makefile

BINARY_NAME=gh-picker
BUILD_DIR=.
GO=go
GOFLAGS=-ldflags="-s -w"

.PHONY: all build clean install uninstall test fmt vet

all: build

build:
	$(GO) build $(GOFLAGS) -o $(BINARY_NAME) .
	@echo "Build complete: $(BINARY_NAME)"

clean:
	rm -f $(BINARY_NAME)
	@echo "Cleaned build artifacts"

install: build
	@echo "Installing to /usr/local/bin..."
	@cp $(BINARY_NAME) /usr/local/bin/$(BINARY_NAME)
	@chmod +x /usr/local/bin/$(BINARY_NAME)
	@echo "Installed to /usr/local/bin/$(BINARY_NAME)"

uninstall:
	rm -f /usr/local/bin/$(BINARY_NAME)
	@echo "Uninstalled from /usr/local/bin"

test:
	$(GO) test -v ./...

fmt:
	$(GO) fmt ./...

vet:
	$(GO) vet ./...

# Development helpers
dev: build
	./$(BINARY_NAME)

# Cross compilation
build-linux:
	GOOS=linux GOARCH=amd64 $(GO) build $(GOFLAGS) -o $(BINARY_NAME)-linux-amd64 .

build-darwin:
	GOOS=darwin GOARCH=amd64 $(GO) build $(GOFLAGS) -o $(BINARY_NAME)-darwin-amd64 .
	GOOS=darwin GOARCH=arm64 $(GO) build $(GOFLAGS) -o $(BINARY_NAME)-darwin-arm64 .

build-windows:
	GOOS=windows GOARCH=amd64 $(GO) build $(GOFLAGS) -o $(BINARY_NAME)-windows-amd64.exe .

build-all: build-linux build-darwin build-windows
