# Phase 5: Multi-Language Linter Targets

**Depends on:** Phase 4 (security audit pattern for external tool integration)
**Objective:** Add Python (ruff), Go (golangci-lint), and Rust (cargo audit/clippy) linter integrations as engine sub-modules

## Work

### Task 5.1: Python linter integration
**Files:**
- Create: `src/engines/lint-external/python.ts`

Integrate ruff for Python linting:
- Detect Python files (*.py) in project
- Run `ruff check --output-format=json .` with timeout
- Parse ruff JSON output to diagnostics
- Map ruff severity: E→error, W→warning, I→info
- Graceful skip if ruff not installed with install instructions

### Task 5.2: Go linter integration
**Files:**
- Create: `src/engines/lint-external/go.ts`

Integrate golangci-lint for Go:
- Detect Go files (*.go) and go.mod
- Run `golangci-lint run --out-format=json ./...` with timeout
- Parse JSON output to diagnostics
- Map severity by rule prefix (revive→warning, govet→error, etc.)
- Skip if golangci-lint not installed

### Task 5.3: Rust linter integration
**Files:**
- Create: `src/engines/lint-external/rust.ts`

Integrate clippy for Rust:
- Detect Rust files (*.rs) and Cargo.toml
- Run `cargo clippy --message-format=json 2>&1` with timeout
- Parse JSON lines, filter for diagnostics
- Map clippy levels: error→error, warning→warning, note→info
- Skip if cargo/clippy not installed

### Task 5.4: External lint engine wrapper
**Files:**
- Create: `src/engines/lint-external/index.ts`

Generic wrapper engine:
- name: 'lint-external'
- Detects project languages from discover.ts
- Runs appropriate linters for each detected language
- Aggregates results into single EngineResult
- Each linter runs as async subprocess with timeout
- Register in orchestrator + types + CLI

### Task 5.5: Register engine
**Files:**
- Modify: `src/types/index.ts` — add 'lint-external' to EngineName
- Modify: `src/engines/orchestrator.ts` — add lazy loader
- Modify: `src/cli.ts` — add to rules command

## Acceptance criteria
- [ ] Python project with ruff installed: `deep-slop scan .` runs ruff and produces Python diagnostics
- [ ] Go project with golangci-lint installed: Go diagnostics produced
- [ ] Rust project with clippy installed: Rust diagnostics produced
- [ ] If linter tool not installed: engine produces 0 diagnostics with info message (not error)
- [ ] Each linter has configurable timeout
- [ ] `npx tsc --noEmit` = 0 errors

## Evidence commands
```bash
# Python project test (ruff may not be installed — graceful skip expected)
mkdir -p /tmp/python-test && echo 'import os\nos.path.join("a","b")' > /tmp/python-test/test.py
node dist/cli.js scan /tmp/python-test 2>&1 | grep -E "lint-external|python"
# Build + test
npx tsc --noEmit && npx vitest run
```

## Mandatory commands
```bash
npx tsc --noEmit
npx vitest run
```

## Cleanliness expectations
- No debug prints
- No TODO/FIXME
- Clean override: no
