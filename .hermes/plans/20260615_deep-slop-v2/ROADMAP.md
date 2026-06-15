# deep-slop v2.0 — ROADMAP

**Goal:** 6 major features: Python AST engine, expanded auto-fixes, Go/Rust rules, HTML trend reports, plugin ecosystem, and test coverage
**Architecture:** New `python-deep` engine with tree-sitter, fix implementations in existing engines, `report` CLI command, plugin example + docs, test suites for all engines
**Baseline ref:** 5244816f49b81f7f7bc35ba66c4da3658c6e7eac
**Total phases:** 8
**Estimated complexity:** large

## Risks
1. tree-sitter Python/Go/Rust WASM grammars may not load in all Node versions — fallback to regex required
2. Auto-fix for `unused-export` is destructive — must have rollback verification
3. Plugin API surface may be too narrow — risk of breaking changes later

## Phase plan
| Phase | Name | Depends on | Key deliverable |
|-------|------|-----------|-----------------|
| 1 | Python AST engine | — | `python-deep` engine with 10+ rules, tree-sitter Python |
| 2 | Auto-fix expansion | Phase 1 | Fix implementations for 4 top rules (unused-export, sync-in-async, repeated-constant, hardcoded-config) |
| 3 | Go tree-sitter rules | — | `go-deep` engine with 8+ rules |
| 4 | Rust tree-sitter rules | — | `rust-deep` engine with 8+ rules |
| 5 | HTML trend reports | Phase 1 | `deep-slop report` command, HTML output with charts |
| 6 | Plugin ecosystem | Phase 1 | Example plugin + documentation + loader improvements |
| 7 | Test coverage boost | Phase 1-4 | Comprehensive tests for all new + existing engines |
| 8 | Final verification | Phase 1-7 | Build, typecheck, self-scan, version bump |

## Mandatory verification commands
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- Tests: `pnpm test`
- Self-scan: `node dist/deep-slop-bundled.js scan .`
