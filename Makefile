.PHONY: help all install compile lint test unit nuts build clean

BIN := ./node_modules/.bin

# Default target
help:
	@echo "Targets mirroring the test.yml CI pipeline:"
	@echo ""
	@echo "  make all        Full local test run: install, unit tests, then NUTs"
	@echo "  make install    Install dependencies"
	@echo "  make compile    Compile TypeScript"
	@echo "  make lint       Run ESLint"
	@echo "  make unit       Run unit tests (mirrors CI unit-tests job)"
	@echo "  make nuts       Run NUT tests (mirrors CI nuts job, requires target org)"
	@echo "  make test       Run unit tests then NUTs in sequence (mirrors full CI pipeline)"
	@echo "  make build      Compile + lint"
	@echo "  make clean      Clean build artifacts"

all: install unit nuts

install:
	yarn install --mode=skip-build

compile: install
	$(BIN)/tsc -p . --pretty --incremental

lint: install
	$(BIN)/eslint src test --color --cache --cache-location .eslintcache

# Mirrors: salesforcecli/github-workflows unitTest.yml
# Runs: compile, lint, test:compile, and mocha unit tests
unit: install
	$(BIN)/tsc -p . --pretty --incremental
	$(BIN)/tsc -p ./test --pretty
	$(BIN)/eslint src test --color --cache --cache-location .eslintcache
	FORCE_COLOR=2 $(BIN)/mocha "test/**/*.test.ts"

# Mirrors: salesforcecli/github-workflows nut.yml
# Requires a target org — set TESTKIT_ORG_USERNAME or ensure a default org is set
# Skips gracefully if no *.nut.ts files exist yet
nuts: install compile
	@if [ -z "$$(find . -name '*.nut.ts' -not -path '*/node_modules/*' 2>/dev/null)" ]; then \
		echo "No NUT files found, skipping nuts target."; \
	else \
		FORCE_COLOR=2 $(BIN)/mocha "**/*.nut.ts" --slow 4500 --timeout 600000; \
	fi

# Mirrors the full test.yml pipeline: unit-tests, then nuts
test: unit nuts

build: install
	$(BIN)/tsc -p . --pretty --incremental
	$(BIN)/eslint src test --color --cache --cache-location .eslintcache

clean:
	yarn clean
