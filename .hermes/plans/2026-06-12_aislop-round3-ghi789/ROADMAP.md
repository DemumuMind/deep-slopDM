# DEEP-SLOP Round 3 — ROADMAP

**Goal:** Close the remaining competitive gaps with aislop by implementing the 8 highest-priority features: interactive TUI, architecture rules engine, CI subcommand + coverage gate, security audit (4 languages), extended security patterns, multi-language linter targets, agent TUI, and agent monitor daemon.
**Architecture:** All new modules integrate into existing src/ structure. New engines extend the 12-engine registry. Agent TUI and monitor build on existing watch/agent modules.
**Baseline ref:** 0003dfdec9cc630fb941256a15478998235a9615
**Total phases:** 6
**Estimated complexity:** large

## Risks
1. **Multi-language linters require external tools** (ruff, golangci-lint, cargo audit) that may not be installed. Mitigation: graceful fallback with install instructions.
2. **Agent TUI complexity** — streaming display with readline. Mitigation: use ink/yocto-spinner or raw readline like aislop (zero-dep).
3. **Architecture rules YAML parsing** — new rule types (forbid_import, require_pattern) need AST support for Python/Go. Mitigation: start with regex import extraction, upgrade to tree-sitter later.

## Phase plan
| Phase | Name | Depends on | Key deliverable |
|-------|------|-----------|-----------------|
| 1     | Interactive TUI + Live Grid | — | searchSelect fuzzy menu + spinner progress |
| 2     | Architecture Rules Engine | — | .deep-slop/rules.yml + forbid_import + require_pattern |
| 3     | CI Subcommand + Coverage Gate | — | ci command with threshold exit codes + scoreable check |
| 4     | Security Audit + Extended Security | — | npm/pip/govulncheck/cargo audit + secrets + XSS |
| 5     | Multi-Language Linter Targets | Phase 4 | ruff + golangci-lint + cargo audit integrations |
| 6     | Agent TUI + Monitor Daemon | — | Real-time repair viz + background monitor + sessions |

## Mandatory verification commands
- Build: `npx tsc`
- Typecheck: `npx tsc --noEmit`
- Tests: `npx vitest run`
