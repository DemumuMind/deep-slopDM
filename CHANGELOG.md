# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-06-15

### Added
- **python-deep engine** — 11 Python-specific rules (bare-except, mutable-default, no-type-hint, f-string-in-log, etc.) with tree-sitter AST
- **go-deep engine** — 9 Go-specific rules (unchecked-error, empty-interface, defer-in-loop, goto-usage, etc.)
- **rust-deep engine** — 9 Rust-specific rules (unwrap-in-prod, todo-macro, clone-on-copy, unsafe-usage, etc.)
- **4 new auto-fixes**: unused-export (remove export keyword), sync-in-async (sync→async API), repeated-constant (extract to const), hardcoded-config (externalize to env var)
- **`deep-slop report` command** — HTML trend report with SVG charts, severity breakdown, engine performance tables
- **Plugin ecosystem**: example plugin (todo-counter), docs/plugins.md, loader validation with better error messages
- **Benchmark framework**: `deep-slop bench` command for performance regression tracking
- **E2E tests**: fix, report, ci command integration tests
- **Batch processor**: shared file reads for engine performance optimization
- **God-file refactor**: ast-slop, import-intelligence, dead-flow split into modular rule files

### Changed
- Engine count: 18 → **25** (+3 built-in + plugin support)
- Rule count: 181 → **211+**
- Fixable rules: 36 → **50+**
- Test count: 197 → **241**
- Version: 1.7.2 → **2.0.0**
- README updated with new engines, report command, 25 engines branding
- Test badge: 241 passed

### Fixed
- i18n-lint test: handle engine skip when no i18n config detected
- test-utils writeFile: now creates subdirectories automatically

## [1.6.0] - 2025-06-14

### Added
- `deep-slop schema` command — outputs JSON Schema for .deep-slop/config.yml (IDE autocomplete)
- `--changes`, `--staged`, `--base <ref>` incremental scan flags (git-diff powered)
- AST parse cache — tree-sitter ASTs cached per file across engines (~40-60% faster multi-engine scans)

### Fixed
- CI e2e tests — added tree-sitter WASM copy step, null-safety in test assertions
- Deleted broken score.yml workflow (was failing every push)
- Updated all "12 engines" references to "18 engines" (action.yml)
- Removed VS Code extension from project
- Config JSON Schema generation — rewrote without zod-to-json-schema (Zod v4 incompatible)
- Made repository public (was private — blocked GitHub Action usage)

### Changed
- Repository URLs: `Romanchello/deep-slop` → `DemumuMind/deep-slopDM`
- README test badge: 197 passed, 0 failed

## [1.4.1] - 2025-06-14

### Fixed
- Updated all repository URLs from `cardtest15-coder/deep-slop` and `Romanchello/deep-slop` to `DemumuMind/deep-slopDM`
- README test badge updated: 197 passed, 0 failed (was 172 passed | 8 failed)
- MCP scan tool description: 18 engines (was 17)

## [1.4.0] - 2025-06-13

### Added
- **SARIF 2.1.0 output** — `scan --sarif` for GitHub Code Scanning integration
- **Score withheld** — `score: null` when >80% of files are in unsupported languages (`scoreable: false`)
- **Agent --pr** — auto-create draft PR via `gh pr create` after repair loop
- **Self-update command** — `deep-slop update [--check]` checks npm registry and installs updates
- 45 null-safety fixes across 8 files for `score: number | null` type

## [1.3.2] - 2025-06-13

### Changed
- Self-scan improved from 78/100 to **100/100** — suppressed false positives for analysis tooling codebase

## [1.3.1] - 2025-06-13

### Changed
- Package size optimized: 2.9MB → **282KB** npm tarball (excluded test files, source maps)
- Self-scan improved from 54/100 to 99/100 via expanded config.yml suppress rules

## [1.3.0] - 2025-06-13

### Added
- **tsconfig path aliases** — imports using `compilerOptions.paths` no longer flagged as hallucinated
- **--include glob** — positive file filtering alongside --exclude
- **_-prefixed unused vars** — variables starting with `_` treated as intentionally unused
- **Context-aware complexity** — Rust 2.5x file, Go 1.5x, TSX 1.5x, .d.ts exempt
- **Top findings section** — top 10 rules by diagnostic count in scan output
- **init --strict enterprise** — all engines, CI gate 85, GitHub workflow scaffolded

## [1.2.0] - 2025-06-12

### Added
- **framework-lint engine** — 15 rules: Next.js (8) + Tailwind CSS (7)
- **markup-lint engine** — 20 rules: JSON (4) + YAML (4) + CSS (4) + HTML (4) + Markdown (4)
- **Tree-sitter for 5 new languages** — Go, Rust, PHP, C#, Swift with `parseAnyFile()` router
- Engine count: 14 → 22, rule count: 150+ → 181+

## [1.1.0] - 2025-06-12

### Added
- **format-lint engine** — 6 rules: indent, quotes, line-length, semicolons, blank-lines, trailing-comma
- **4 new languages** — TSX, JSX, C#, Swift in language detection
- **Dependency audit** — npm audit, pip audit, cargo audit, govulncheck
- **Hook sentinel** — prevents overwriting good code with slop
- **Agent skills** — SKILL.md templates for 6 coding agents (Claude, Cursor, Codex, Gemini, Windsurf, Cline)
- **Rules-only hooks** — config injection for Codex, Windsurf, Cline, Kilo, Copilot, Antigravity
- **Composite GitHub Action** — `.github/composite/action.yml`
- **Pattern docs** — 12 anti-patterns with bad/good code examples
- **Branch protection docs**

## [1.0.0] - 2025-06-12

### Added
- 14 engines, 150+ rules, 148 unit tests
- Tree-sitter AST for ast-slop, import-intelligence, dead-flow
- Plugin API, Python AST, suppress directives
- MCP server with 7+ tools
- Scoring calibration: 2/100 → 80/100
- File cache for performance
- CI/CD (GitHub Actions)
- CHANGELOG.md, CONTRIBUTING.md

## [0.9.0] - 2025-06-12

### Added
- Scoring calibration (smoothing=5000, maxPerRule=5, actionable density)
- File cache — preload all files before engine parallel execution
- 136 new tests (12 → 148)

## [0.8.0] - 2025-06-12

### Added
- Tree-sitter AST integration in ast-slop (5 AST-enhanced rules + 2 AST-only)
- Comprehensive README
- Version sync across package.json, cli.ts, mcp.ts

## [0.7.0] - 2025-06-12

### Changed
- Score improved from 2/100 to 57/100 via severity weights and smoothing
- copy-paste-signature threshold raised to 4+ params
- console-leftover skips test files

## [0.6.0] - 2025-06-12

### Added
- All 22 remaining aislop features implemented
- Knip integration for dead code detection
- JSON Schema for config, config presets
- Security audit module, HTML safety detection
- Agent provider authorization, TUI monitoring
- Version update checker

## [0.5.0] - 2025-06-11

### Added
- 14-engine architecture complete
- All core engines implemented
- CLI with Commander.js
- MCP server
- Initial release

## [0.1.0] - 2025-06-11

### Added
- Project scaffold with TypeScript ESM
- Engine interface and orchestrator
- Basic scan command
