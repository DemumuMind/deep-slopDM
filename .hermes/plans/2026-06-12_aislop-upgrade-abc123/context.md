# Context — Recon Summary

## aislop (scanaislop/aislop v0.12.0)
- 37 command files, 28 ai-slop detector files, 40+ test files
- 6 engines: format, lint, code-quality, ai-slop, architecture, security
- Wraps external tools: biome, oxlint, ruff, knip, golangci-lint, clippy, rubocop
- MCP: 4 tools (scan, fix, why, baseline)
- Output: terminal (themed), JSON, SARIF 2.1.0
- Scoring: density-aware logarithmic with 60+ per-rule impact tiers (6 tiers: strict/standard/maintainability/mechanical/style/advisory)
- Config: YAML with Zod v4 validation, extends/inheritance, JSON Schema gen
- Integrations: VS Code extension, GitHub Action, pre-commit hooks, 16 coding agent flags
- Fix: plan → steps → apply → verify pipeline (6 files)
- Extras: suppress directives, source masking, score badge, trend tracking, telemetry

## deep-slop (v0.2.0)
- 4 commands, 12 engines, 12 test files
- 12 engines: ast-slop, import-intelligence, dead-flow, type-safety, syntax-deep, security-deep, arch-constraints, dup-detect, perf-hints, i18n-lint, config-lint, meta-quality
- MCP: 5 tools (scan, fix, why, engines, score)
- Output: emoji-based terminal, JSON
- Scoring: linear penalty (errors*10 + warnings*3 + info*1 + suggestions*0.5)
- Config: TypeScript interface DEFAULT_CONFIG, no validation
- Tree-sitter AST utility created but not yet integrated into engines

## Competitive advantages (deep-slop > aislop)
1. 12 specialized engines vs 6
2. Tree-sitter AST parsing (real AST, not regex)
3. Alternative import path suggestions (lodash/X, barrel optimization)
4. Import graph analysis (graphology)
5. Suggestion system with confidence scores
6. More granular per-feature config toggles
7. 4 severity levels (error/warning/info/suggestion)

## Critical gaps (aislop > deep-slop)
1. Scoring system (linear vs logarithmic with tiers)
2. SARIF output
3. Config validation (Zod)
4. CLI commands (init, doctor, badge, trend)
5. Terminal color/theme system
6. Fix pipeline
7. GitHub Action + pre-commit hooks
8. Coding agent integrations
9. Suppress directives
