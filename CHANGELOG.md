# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2025-06-12

### Added
- Version synchronization across all packages and configuration files.
- `tree-sitter-python` as an explicit dependency for reliable AST parsing.
- `CHANGELOG.md` — this file.
- `CONTRIBUTING.md` — contributor guidelines and development setup instructions.
- Real-world validation pass: all engines and rules tested against production codebases.

## [0.9.0] - 2025-06-11

### Added
- GitHub Actions CI/CD pipeline for automated testing and release workflows.
- Tree-sitter AST integration for `import-intelligence` and `dead-flow` engines.
- Plugin API for third-party engine and rule extensions.
- Python native AST parsing support.
- Suppress directives (`// deep-slop-disable`) for inline rule suppression.
- End-to-end test fixtures covering full scan → fix pipelines.
- `fix --dry-run`, `fix --plan`, and `fix --verify` modes for safe automated repairs.

## [0.8.0] - 2025-06-10

### Added
- Tree-sitter AST integration in `ast-slop` engine.
- 5 AST-enhanced rules and 2 AST-only rules in `ast-slop`.
- 136 new test cases (148 total across the project).
- Comprehensive README with architecture diagrams and usage examples.

## [0.7.0] - 2025-06-09

### Changed
- Scoring calibration: baseline score raised from 2 → 57/100 for more realistic assessments.
- Improved actionable density formula for higher signal-to-noise in findings.
- Refined copy-paste-signature detection threshold.

### Added
- File cache for faster re-scans of unchanged files.

## [0.6.0] - 2025-06-08

### Added
- Knip integration for dead-code elimination hints.
- JSON schema validation for configuration files.
- README badge for CI status and slop score.
- `.deep-slopignore` file support for excluding paths and patterns.
- Configuration presets (strict, relaxed, default) for quick setup.
- MCP baseline commands for snapshotting and comparing scan results.
- Finding assessment workflow for triaging and annotating issues.
- Hook feedback loop and `hook uninstall` command.
- Agent `connect` and `use` commands for remote agent sessions.
- Fix preview mode before applying automated repairs.
- Discovery command for exploring available engines and rules.
- 10 new AI-slop detection rules.
- Update notifier for new versions.
- Typo suggestions in diagnostics.
- Score smoothing to reduce jitter between runs.
- TUI home screen and command reference panel.
- 16 agent provider integrations with pricing information.
- Telemetry (opt-in) for usage analytics.

## [0.5.0] - 2025-06-07

### Added
- Interactive TUI (Terminal User Interface) for real-time scan browsing.
- Architecture rules engine for enforcing structural constraints.
- CI coverage gate: fail pipelines below a configurable slop-score threshold.
- Security audit engine with secrets detection and XSS scanning.
- Multi-language linter integration: `ruff` (Python), `golangci-lint` (Go), `clippy` (Rust).
- Agent TUI and monitor dashboard for watching automated repair sessions.

## [0.4.0] - 2025-06-06

### Added
- Diff-aware scanning: only analyze changed lines in VCS-tracked files.
- Rule severity overrides in configuration (`high` / `medium` / `low`).
- Trend and score history tracking across runs.
- Watch mode for continuous background scanning on file changes.
- Hook system for pre-commit and CI integration.
- Agent repair loop for iterative autonomous fixes.
- VS Code extension with inline diagnostics and quick-fix actions.
- MCP `why` and `fix` tools for LLM-driven explanations and repairs.
- Rules explorer for browsing and searching all loaded rules.

## [0.3.0] - 2025-06-05

### Added
- Suppress directives for silencing specific rules inline or per-file.
- Diff-aware scanning (initial implementation).
- Rule severity override configuration.
- Trend and score history persistence.
- Watch mode for live re-scanning.
- Hook system (pre-commit, pre-push).
- Agent repair loop for iterative fix-and-verify cycles.
- VS Code extension (initial release).
- MCP `why` and `fix` server tools.
- Rules explorer UI.

## [0.2.0] - 2025-06-04

### Added
- `arch-constraints` engine — architectural boundary enforcement.
- `dup-detect` engine — duplicate and near-duplicate code detection.
- `perf-hints` engine — performance anti-pattern detection.
- `i18n-lint` engine — internationalization and locale issues.
- `config-lint` engine — configuration file validation.
- `meta-quality` engine — meta-level quality and consistency checks.
- 12 engines total with 134 rules across all engines.

## [0.1.0] - 2025-06-03

### Added
- Initial project scaffolding and build pipeline.
- 6 core engines:
  - `ast-slop` — AST-based AI-generated code detection.
  - `import-intelligence` — unused and misordered import analysis.
  - `dead-flow` — unreachable code and dead branch detection.
  - `type-safety` — type annotation and casting issues.
  - `syntax-deep` — deep syntactic pattern analysis.
  - `security-deep` — security vulnerability scanning.
- CLI `scan` and `fix` commands.
- MCP (Model Context Protocol) server for LLM tool integration.

[Unreleased]: https://github.com/cardtest15-coder/deep-slop/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/cardtest15-coder/deep-slop/releases/tag/v1.0.0
[0.9.0]: https://github.com/cardtest15-coder/deep-slop/releases/tag/v0.9.0
[0.8.0]: https://github.com/cardtest15-coder/deep-slop/releases/tag/v0.8.0
[0.7.0]: https://github.com/cardtest15-coder/deep-slop/releases/tag/v0.7.0
[0.6.0]: https://github.com/cardtest15-coder/deep-slop/releases/tag/v0.6.0
[0.5.0]: https://github.com/cardtest15-coder/deep-slop/releases/tag/v0.5.0
[0.4.0]: https://github.com/cardtest15-coder/deep-slop/releases/tag/v0.4.0
[0.3.0]: https://github.com/cardtest15-coder/deep-slop/releases/tag/v0.3.0
[0.2.0]: https://github.com/cardtest15-coder/deep-slop/releases/tag/v0.2.0
[0.1.0]: https://github.com/cardtest15-coder/deep-slop/releases/tag/v0.1.0
