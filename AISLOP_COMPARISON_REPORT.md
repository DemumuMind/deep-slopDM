# aislop vs deep-slop: Comprehensive Feature Comparison

> Analysis of https://github.com/scanaislop/aislop (v0.12.0) vs our deep-slop (v1.6.0)

---

## 1. Source Directory Structure

### aislop `src/` layout
```
src/
  cli.ts                     # CLI entry (commander.js, 14KB)
  mcp.ts                     # MCP server entry
  index.ts                   # Public API exports
  version.ts                 # APP_VERSION constant
  update-notifier.ts         # npm update checker
  cli/
    agent-command.ts         # `aislop agent` subcommand
    hook-command.ts          # `aislop hook` subcommand
  commands/                  # 37 command files (!!!)
    scan.ts, fix.ts, ci.ts, init.ts, doctor.ts, rules.ts
    interactive.ts, badge.ts, trend.ts, update.ts
    fix-code.ts, fix-force.ts, fix-pipeline.ts, fix-plan.ts
    fix-render.ts, fix-steps.ts, fix-expo.ts
    scan-coverage.ts, scan-exit-code.ts, scan-render.ts
    agent.ts, agent-apply.ts, agent-background.ts
    agent-connect.ts, agent-monitor.ts, agent-plan.ts
    agent-session.ts, agent-sessions.ts, agent-stop.ts
    agent-watch.ts, agent-providers.ts, agent-use.ts
    ... (20+ agent-*.ts files)
  config/
    schema.ts                # Zod v4 validation
    defaults.ts              # Default YAML templates
    extends.ts               # Config inheritance ("extends" key)
    index.ts                 # File discovery/loading
  engines/
    types.ts                 # Diagnostic, Engine, EngineContext types
    orchestrator.ts          # Parallel engine runner
    format/                  # Biome, ruff, gofmt, cargo fmt, rubocop, php-cs-fixer
    lint/                    # oxlint, ruff, golangci-lint, clippy, rubocop
    code-quality/            # Complexity, duplication, dead code (knip)
    ai-slop/                 # 28 files! 13+ rules, multi-language
    architecture/            # Custom import/path rules from rules.yml
    security/                # Secrets, eval, innerHTML, SQL/shell injection
    python-targets.ts        # Python-specific file discovery
  scoring/
    index.ts                 # Density-aware logarithmic scoring
    rule-impact.ts           # 60+ rule impact tiers (strict/standard/mechanical/style/advisory)
    rule-severity.ts         # Severity mapping
  output/
    terminal.ts              # Rich terminal rendering with theme
    json.ts                  # JSON output format
    sarif.ts                 # SARIF 2.1.0 output (GitHub code scanning)
    engine-info.ts           # Engine label mapping
    rule-labels.ts           # Rule display names with categories
    finding-assessment.ts    # Finding assessment rendering
  telemetry/
    index.ts                 # PostHog telemetry (opt-out)
  ui/
    home.ts                  # Root help rendering
    logger.ts                # Structured logger
    suggest.ts               # "Did you mean?" fuzzy command matching
    brand.ts                 # Brand highlighting
    symbols.ts               # Unicode symbols
    theme.ts                 # Color theme system
  agents/                    # AI agent session tracking
  hooks/                     # Git hook management
  utils/                     # Discovery, git, subprocess, tooling
```

### deep-slop `src/` layout
```
src/
  cli.ts                     # CLI entry (commander.js, ~4KB)
  mcp.ts                     # MCP server entry
  index.ts                   # Public API exports
  cli/                       # Empty
  config/                    # Empty
  mcp/                       # Empty
  scoring/                   # Empty
  engines/
    orchestrator.ts          # Parallel engine runner
    test-utils.ts            # Test helpers
    ast-slop/                # index.ts + index.test.ts
    import-intelligence/     # index.ts + index.test.ts
    dead-flow/               # index.ts + index.test.ts
    type-safety/             # index.ts + index.test.ts
    syntax-deep/             # index.ts + index.test.ts
    security-deep/           # index.ts + index.test.ts
    arch-constraints/        # index.ts + index.test.ts
    dup-detect/              # index.ts + index.test.ts
    perf-hints/              # index.ts + index.test.ts
    i18n-lint/               # index.ts + index.test.ts
    config-lint/             # index.ts + index.test.ts
    meta-quality/            # index.ts + index.test.ts
  output/
    formatter.ts             # Basic emoji-based formatter
  types/
    index.ts                 # All types in one file
  utils/
    discover.ts              # Language/framework detection
    file-utils.ts            # File utilities
    tree-sitter.ts           # Tree-sitter setup
```

**KEY DIFFERENCE**: aislop has 37 command files vs our 4 commands. aislop has 28 ai-slop detector files vs our 1 per engine. aislop has a full UI/theme system, telemetry, SARIF output, agent monitoring, and rich scoring. We have empty directories for cli/, config/, mcp/, scoring/.

---

## 2. MCP Server Implementation

### aislop MCP: 4 tools
| Tool | Purpose | Implementation |
|------|---------|----------------|
| `aislop_scan` | Full project scan | Takes path + options, returns scored scan result |
| `aislop_fix` | Auto-fix issues | Takes path + fix options, applies safe fixes |
| `aislop_why` | Explain why a rule flagged code | Takes rule ID, returns explanation with rationale |
| `aislop_baseline` | Set/compare against baseline | Saves scan results as baseline for future comparison |

**Key patterns**:
- Telemetry instrumentation on every tool call (duration, success/failure)
- `instrument()` wrapper function for consistent error handling
- Separate `tools.ts` file with Zod schemas for each tool's input
- StdioServerTransport

### deep-slop MCP: 5 tools
| Tool | Purpose | Implementation |
|------|---------|----------------|
| `deep_slop_scan` | Full project scan | Similar to aislop_scan |
| `deep_slop_fix` | Auto-fix issues | Basic, not fully implemented |
| `deep_slop_why` | Explain rule | Hardcoded explanations map |
| `deep_slop_engines` | List engines | Lists all 18 engines with rule counts |
| `deep_slop_score` | Quick score check | Returns just score + severity counts |

**What aislop has that we don't**:
- **Baseline tool** — Save scan results as baseline for regression detection. HIGH VALUE.
- **Telemetry instrumentation** — Track tool usage, durations, errors. MEDIUM VALUE.
- **Consistent error handling** — `instrument()` wrapper. We have raw try/catch. LOW-MEDIUM VALUE.

**What we have that aislop doesn't**:
- **Engines listing tool** — Useful for agents to discover capabilities. LOW VALUE (aislop uses rules command).
- **Quick score tool** — Lightweight endpoint for CI checks. MEDIUM VALUE.

**Recommendation**: Add a `deep_slop_baseline` tool. Move tool schemas to separate file. Add telemetry wrapper.

---

## 3. CLI Implementation

### aislop CLI Commands
| Command | Description | Key Options |
|---------|-------------|-------------|
| `aislop [dir]` | Default = interactive or scan | --changes, --staged, --base, --verbose, --json, --sarif, --format, --exclude, --include |
| `aislop scan [dir]` | Score and print findings | Same flags as above |
| `aislop fix [dir]` | Auto-fix or hand to agent | --verbose, --force, --safe, --prompt, --claude, --codex, --cursor, --windsurf, --vscode, --amp, --antigravity, --deep-agents, --gemini, --kimi, --opencode, --warp, --aider, --goose, --pi, --crush |
| `aislop agent` | Agent session management | Many sub-commands |
| `aislop init [dir]` | Create config + CI workflow | --strict |
| `aislop doctor [dir]` | Check toolchain coverage | None |
| `aislop ci [dir]` | CI quality gate | --changes, --staged, --base, --human, --sarif, --format |
| `aislop rules [dir]` | Explain rules | --search (interactive explorer) |
| `aislop badge [dir]` | Score badge URL/markdown | --owner, --repo, --json |
| `aislop trend [dir]` | Show local score history | --limit |
| `aislop update` | Check for newer version | None |
| `aislop version` | Print version | None |
| `aislop commands` | List commands and flags | None |
| `aislop hook` | Git hook management | Setup/list/uninstall |
| `aislop agent ...` | 15+ agent sub-commands | Session management, monitoring |

**Key patterns**:
- `commaSeparatedParser` for --exclude/--include (comma or repeatable)
- `suggestClosest()` — "Did you mean?" for mistyped commands
- Custom root help rendering (`renderRootHelp`)
- Custom command reference rendering (`renderCommandReference`)
- `maybeNotifyUpdate()` — Checks npm for newer version
- Interactive mode when no args + TTY
- SARIF output format for GitHub code scanning

### deep-slop CLI Commands
| Command | Description | Key Options |
|---------|-------------|-------------|
| `deep-slop scan` | Scan project | --json, --changes, --staged, --include, --exclude, --engine, --severity |
| `deep-slop fix` | Auto-fix (stub) | --engine, --safe, --dry-run |
| `deep-slop ci` | CI mode | --fail-below |
| `deep-slop rules` | List rules (static) | None |

**What aislop has that we don't** (value rating):
1. **16 coding agent integrations** (`--claude`, `--codex`, `--cursor`, etc.) — VERY HIGH VALUE. This is their killer feature.
2. **`aislop init`** — Scaffolds config + CI workflow — HIGH VALUE
3. **`aislop doctor`** — Checks which tools are installed (biome, ruff, etc.) — HIGH VALUE
4. **SARIF output** — For GitHub code scanning integration — HIGH VALUE
5. **`--sarif` and `--format`** flags — Flexible output — MEDIUM VALUE
6. **Interactive mode** — Rich TUI when no args + TTY — MEDIUM VALUE
7. **`aislop badge`** — Score badge for README — MEDIUM VALUE
8. **`aislop trend`** — Local score history tracking — MEDIUM VALUE
9. **`aislop update`** — Version checker — LOW VALUE
10. **`suggestClosest()`** — Fuzzy command matching — LOW VALUE
11. **Git hook management** (`aislop hook`) — MEDIUM VALUE
12. **Agent monitoring system** (15+ sub-commands) — LOW VALUE for now

---

## 4. Config File Format

### aislop `.aislop/config.yml`
```yaml
version: 1
exclude: [...]
engines:
  format: true
  lint: true
  code-quality: true
  ai-slop: true
  architecture: false
  security: true
quality:
  maxFunctionLoc: 80
  maxFileLoc: 400
  maxNesting: 5
  maxParams: 6
security:
  audit: true
  auditTimeout: 25000
scoring:
  weights:
    format: 0.5
    lint: 1.0
    code-quality: 1.5
    ai-slop: 1.0
    architecture: 1.0
    security: 2.0
  thresholds:
    good: 75
    ok: 50
ci:
  failBelow: 0
  format: json
```

**Also has**: `.aislop/rules.yml` — Custom architecture rules (BYO rules like `forbid_import`, `forbid_import_from_path`)

**Schema**: Zod v4 (`AislopConfigSchema`) with `parseConfig()` that merges partial overrides. Auto-generates JSON Schema for editor autocomplete.

### deep-slop `.deep-slop/config.yml`
```yaml
engines:
  ast-slop: true
  import-intelligence: true
  ...
quality: { maxFunctionLoc: 50, maxFileLoc: 300, ... }
security: { audit: true, owasp: true, ... }
imports: { suggestAlternatives: true, ... }
types: { flagAsAny: true, ... }
deadCode: { unreachableBranches: true, ... }
i18n: { hardcodedStrings: false, ... }
exclude: [...]
ci: { failBelow: 50 }
```

**What aislop has that we don't**:
1. **Config `extends`** — Inherit from parent config, override locally. HIGH VALUE.
2. **Scoring weights in config** — Per-engine weight tuning. HIGH VALUE (we hardcode).
3. **Scoring thresholds** — good/ok labels. HIGH VALUE.
4. **`rules.yml` for custom rules** — User-defined architecture rules. MEDIUM VALUE.
5. **Config validation via Zod** — With graceful fallback to defaults. HIGH VALUE.
6. **JSON Schema for autocomplete** — `schema/aislop.config.schema.json` with `$id`. MEDIUM VALUE.
7. **`version` field** — Config schema versioning. LOW VALUE.

**What we have that aislop doesn't**:
1. **More granular engine config** — `imports.suggestAlternatives`, `types.flagAsAny`, `deadCode.unreachableBranches`, etc. This is actually BETTER than aislop's coarser config. KEEP THIS.

---

## 5. Editor Integrations

### aislop
Aislop ships a full VS Code extension with Problems panel integration.

### deep-slop
**No editor integrations.** CLI-only approach — integrates via any terminal or CI.

---

## 6. GitHub Actions Integration

### aislop `action.yml`
```yaml
name: aislop — AI Code Quality Gate
inputs:
  directory:    # Directory to scan (default: ".")
  node-version: # Node.js version (default: "24")
  format:       # Output format — json or human (default: "json")
  version:      # npm aislop CLI version (default: "latest")
runs:
  using: composite
  steps:
    - Setup Node.js (actions/setup-node@v4)
    - Run `npm exec aislop ci <dir>` with format flag
```

**Key patterns**:
- Uses `npm exec` with `--yes` for zero-config usage
- Creates temp directory for npm exec
- Supports version pinning
- Outputs JSON by default (CI-friendly)
- Supports `--human` and `--sarif` formats
- Clean trap for temp directory cleanup

### deep-slop `.github/workflows/ci.yml`
We have a CI workflow that runs our own tests, but **no reusable GitHub Action** that others can use.

**Recommendation**: HIGH VALUE. Create `action.yml` so other repos can use `uses: DemumuMind/deep-slopDM@main` in their CI.

---

## 7. Pre-commit Hooks

### aislop `.pre-commit-hooks.yaml`
```yaml
- id: aislop
  name: aislop
  description: Catch AI slop in staged files before they are committed.
  entry: aislop scan --staged
  language: node
  pass_filenames: false
  require_serial: true
```

This allows users to add aislop as a pre-commit hook with just:
```yaml
repos:
  - repo: https://github.com/scanaislop/aislop
    rev: v0.12.0
    hooks:
      - id: aislop
```

### deep-slop
**No pre-commit hooks.**

**Recommendation**: MEDIUM VALUE. Very easy to add (one file). Requires `--staged` support working properly.

---

## 8. Schema Directory

### aislop `schema/`
- `aislop.config.schema.json` — Full JSON Schema (4.2KB) for `.aislop/config.yml`
  - Allows autocomplete in VS Code when editing config
  - Published at `https://scanaislop.com/schema/aislop.config.schema.json`
  - Auto-generated from Zod schema via `scripts/gen-config-schema.mjs`

### deep-slop
**No schema directory.**

**Recommendation**: MEDIUM VALUE. Auto-generate from our Zod schema. Add `$schema` link in config.

---

## 9. Tests Structure

### aislop `tests/` (40+ test files, 285+ tests)
| Category | Files | Focus |
|----------|-------|-------|
| Core | ai-slop.test.ts, scoring.test.ts, scoring-comprehensive.test.ts, complexity.test.ts | Engine integration |
| CLI | cli-ergonomics.test.ts, cli-json-output.test.ts, scan-exit-code.test.ts, scan-validation.test.ts, interactive.test.ts | CLI behavior |
| Fix | fix-code.test.ts, fix-force.test.ts, fix-safe-mode.test.ts, fix-plan.test.ts, fix-steps.test.ts, fix-verification.test.ts | Auto-fix pipeline |
| Config | config.test.ts, config-extends.test.ts | Config loading/validation |
| Language | python-patterns.test.ts, go-patterns.test.ts, rust-patterns.test.ts, hallucinated-imports.test.ts | Multi-language |
| Security | security.test.ts, secrets.test.ts, knip-runtime-security.test.ts | Security engine |
| Output | output.test.ts | Output rendering |
| MCP | mcp-tools.test.ts | MCP tool behavior |
| Other | action-manifest.test.ts, audit-parse.test.ts, ci-changes-base.test.ts, coverage-gate.test.ts, discover.test.ts, git.test.ts, knip-deps.test.ts, oxlint-config.test.ts, suppress.test.ts, source-files.test.ts, source-masker.test.ts, update-notifier.test.ts, dead-patterns.test.ts, dead-patterns-fix.test.ts, defensive-patterns.test.ts, duplicate-imports.test.ts, duplicate-imports-fix.test.ts, force-fixable.test.ts, meta-comment.test.ts, silent-recovery.test.ts, trivial-comment-block-fix.test.ts, typecheck-engine.test.ts, unused-imports-py.test.ts | Various |
| Subdirs | agents/, commands/, engines/, helpers/, hooks/, lint/, output/, scoring/, telemetry/, ui/ | Organized |

### deep-slop
Tests are inline: each engine has `index.test.ts` next to `index.ts`. No separate `tests/` directory with the above breadth.

**What aislop has that we don't**:
1. **CLI behavior tests** — Testing flag parsing, output format, exit codes. HIGH VALUE.
2. **Fix pipeline tests** — Testing safe/force modes, plan/verify steps. HIGH VALUE.
3. **Config validation tests** — Testing extends, partial overrides. MEDIUM VALUE.
4. **MCP tool tests** — Testing tool schemas, responses. MEDIUM VALUE.
5. **Multi-language test suites** — Dedicated test files per language. MEDIUM VALUE.
6. **Integration test helpers** — Shared fixtures, mock contexts. MEDIUM VALUE.

---

## 10. Scripts Directory

### aislop `scripts/`
| Script | Purpose |
|--------|---------|
| `gen-config-schema.mjs` | Auto-generates `schema/aislop.config.schema.json` from Zod schema |
| `postinstall-tools.mjs` | Downloads external tools (ruff, golangci-lint) on `npm install` |

**Key patterns**:
- Postinstall hook in package.json: `"postinstall": "node scripts/postinstall-tools.mjs"`
- Downloads platform-specific tool binaries
- Checks for project-local tools first (`allowProjectLocalTools` config)

### deep-slop
**No scripts directory.** (Listed in `files` in package.json but doesn't exist.)

**Recommendation**:
- `gen-config-schema.mjs` — MEDIUM VALUE. Auto-generate JSON Schema.
- `postinstall-tools.mjs` — LOW VALUE for us (we don't bundle external linters like ruff/oxlint).

---

## 11. Output Formatter

### aislop `src/output/terminal.ts`
- **Theme system** (`theme.ts`) with named colors: danger, warn, success, muted, bold
- **`style(theme, styleName, text)`** function for consistent coloring
- **Engine grouping** — Diagnostics grouped by engine, then by rule
- **Severity sorting** — Errors first, then warnings, then info
- **Rule header rendering** — `[ERROR] [auto] message text` with count
- **Location truncation** — Only shows 3 locations by default, `+N more` with `-d` flag
- **Word wrapping** — `wrapText()` respects terminal width (capped at 120)
- **Brand highlighting** — `highlightAislop()` for special keywords
- **Engine status** — `printEngineStatus()` shows per-engine results with timing
- **Hidden rules footer** — Shows count of hidden rules when over limit (40 by default)

Also has **6 output files**:
- `terminal.ts` — Rich terminal rendering
- `json.ts` — Structured JSON output
- `sarif.ts` — SARIF 2.1.0 for GitHub code scanning
- `rule-labels.ts` — Display names for 50+ rules
- `engine-info.ts` — Engine label mapping
- `finding-assessment.ts` — Finding assessment rendering

### deep-slop `src/output/formatter.ts`
- **Emoji-based** — Uses emoji (🔴🟡🔵💡) for severity
- **Flat list** — All diagnostics sorted by severity, no grouping
- **Top 50 limit** — Shows top 50 issues, then "... and N more"
- **No color support** — No terminal colors, no theme system
- **No SARIF** — No SARIF output
- **No rule labels** — No display names for rules

**What aislop has that we don't** (value):
1. **Terminal color theme system** — `picocolors`-based with named styles. HIGH VALUE.
2. **SARIF output** — For GitHub code scanning. HIGH VALUE.
3. **Grouped diagnostics** — By engine then by rule. HIGH VALUE.
4. **Rule display names** — Human-readable labels for 50+ rules. MEDIUM VALUE.
5. **Word wrapping** — Respects terminal width. MEDIUM VALUE.
6. **Finding assessment** — Structured assessment of findings. LOW VALUE.

---

## 12. Scoring System

### aislop Scoring (3 files)
**`scoring/index.ts`**: Density-aware logarithmic scoring
- Score = 100 - (100 * log1p(scaledDeductions)) / log1p(100 + scaledDeductions)
- Scales by `issueDensity = min(1, diags / (files + smoothing))`
- Per-engine weights from config
- Per-rule impact multipliers and caps
- Labels: Healthy (>=75), Needs Work (>=50), Critical (<50)

**`scoring/rule-impact.ts`**: 60+ rule impact classifications
- **6 tiers**: strict (1.0x), standard (1.0x), maintainability (0.75x, cap=24), mechanical (0.5x, cap=16), style (0.5x, cap=8), advisory (0.25x, cap=8)
- Each rule has: tier, multiplier, cap, rationale
- Examples:
  - `ai-slop/swallowed-exception` = strict (hides real broken states)
  - `formatting` = mechanical (cleanup, cap=12)
  - `ai-slop/generic-naming` = advisory (weak signal, cap=4)
  - `security/hardcoded-secret` = strict (high risk)
- Wildcard prefixes for external rules: `oxlint/`, `ruff/`, `go/`, `clippy/`, etc.

### deep-slop Scoring
Simple linear penalty:
```
score = max(0, 100 - (errors*10 + warnings*3 + info*1 + suggestions*0.5))
```

**What aislop has that we don't**:
1. **Density-aware scoring** — Penalizes dense issues more than sparse. HIGH VALUE.
2. **Logarithmic scaling** — First issues hurt most, diminishing returns. HIGH VALUE.
3. **Per-rule impact tiers** — 60+ rules classified with multiplier + cap. VERY HIGH VALUE.
4. **Per-engine configurable weights** — From config file. HIGH VALUE.
5. **Rule caps** — Prevents noisy rules from dominating score. HIGH VALUE.
6. **Score labels** — Healthy/Needs Work/Critical with configurable thresholds. MEDIUM VALUE.

**Our scoring is primitive**. A single error-heavy file can tank the score to 0 with just 10 errors. The aislop approach is far more nuanced and production-ready.

---

## 13. Unique Features in aislop (We DON'T Have)

| Feature | Description | Value |
|---------|-------------|-------|
| **16 coding agent integrations** | `--claude`, `--codex`, `--cursor`, `--windsurf`, `--vscode`, `--amp`, `--antigravity`, `--deep-agents`, `--gemini`, `--kimi`, `--opencode`, `--warp`, `--aider`, `--goose`, `--pi`, `--crush` | VERY HIGH |
| **Fix pipeline** (6 files) | Plan → steps → apply → verify → render. Safe/force modes. | VERY HIGH |
| **SARIF output** | GitHub code scanning integration via `--sarif` | HIGH |
| **Density-aware scoring** | Logarithmic with per-rule impact tiers and caps | VERY HIGH |
| **Config extends** | Inherit from parent config files | HIGH |
| **`aislop init`** | Scaffolds config + CI workflow with `--strict` option | HIGH |
| **`aislop doctor`** | Checks toolchain coverage (biome, ruff, oxlint, etc.) | HIGH |
| **VS Code extension** | Full editor integration with Problems panel | HIGH |
| **Pre-commit hook** | `.pre-commit-hooks.yaml` for easy git hook setup | MEDIUM |
| **GitHub Action** | `action.yml` for CI integration | HIGH |
| **Score badge** | `aislop badge` generates shields.io URL | MEDIUM |
| **Score trend tracking** | `aislop trend` shows local history | MEDIUM |
| **Rule severity overrides** | Per-rule severity in config (error/warning/off) | MEDIUM |
| **Custom architecture rules** | `.aislop/rules.yml` with `forbid_import`, `forbid_import_from_path` | MEDIUM |
| **Source masking** | Redacts secrets in diagnostic output | MEDIUM |
| **Suppress directives** | `// aislop-disable-next-line` in source | MEDIUM |
| **Terminal theme system** | Named colors, consistent styling | HIGH |
| **Telemetry** | PostHog, opt-out, install tracking | LOW |
| **Update notifier** | Checks npm for newer version | LOW |
| **Agent monitoring** | 15+ sub-commands for session management | LOW |
| **Expo/React Native support** | `expo-doctor` integration, `fix-expo.ts` | LOW |
| **Multi-language formatting** | Biome (TS/JS), ruff (Python), gofmt (Go), cargo fmt (Rust), rubocop (Ruby), php-cs-fixer (PHP) | MEDIUM |
| **Multi-language linting** | oxlint (TS/JS), ruff (Python), golangci-lint (Go), clippy (Rust), rubocop (Ruby) | MEDIUM |
| **Hallucinated import detection** | Checks if imported packages exist in manifest | MEDIUM |
| **Python-specific rules** | bare except, broad except, mutable defaults, range-len, chained dict get, repetitive dispatch, isinstance ladder | MEDIUM |
| **Go-specific rules** | Library panic detection | LOW |
| **Rust-specific rules** | Non-test unwrap, todo/unimplemented stubs | LOW |

---

## 14. Unique Features in deep-slop (aislop DOESN'T Have)

| Feature | Description | Value |
|---------|-------------|-------|
| **12 specialized engines** vs 6 | We have ast-slop, import-intelligence, dead-flow, type-safety, syntax-deep, security-deep, arch-constraints, dup-detect, perf-hints, i18n-lint, config-lint, meta-quality. Aislop has format, lint, code-quality, ai-slop, architecture, security. | HIGH |
| **Tree-sitter AST parsing** | Real AST analysis via `web-tree-sitter` | HIGH |
| **Alternative import paths** | Suggests tree-shakeable alternatives (lodash/X) | HIGH |
| **Barrel optimization** | Detects and suggests direct imports past barrel files | MEDIUM |
| **Import graph analysis** | Uses graphology for dependency graphs | MEDIUM |
| **Suggestion system** | `Diagnostic.suggestion` with type, text, range, confidence, reason | HIGH |
| **Per-engine fix support** | Each engine can implement `fix()` method | MEDIUM |
| **More granular config** | Per-feature toggles (imports.suggestAlternatives, types.flagAsAny, etc.) | MEDIUM |
| **4 severity levels** | error/warning/info/suggestion vs error/warning/info | LOW |
| **Suggestion severity** | Suggestion-level diagnostics for non-blocking advice | LOW |
| **Java support** | In our Language type (not in aislop) | LOW |

---

## 15. Priority Recommendations

### Tier 1: Must-Have (Immediate Impact)
1. **Upgrade scoring system** — Adopt density-aware logarithmic scoring with per-rule impact tiers. Our linear system is unusable for real projects.
2. **Add SARIF output** — `--sarif` flag for GitHub code scanning. Required for CI adoption.
3. **Add `deep-slop init`** — Config scaffolding command. First-run experience.
4. **Add `deep-slop doctor`** — Toolchain check. Helps users understand what's available.
5. **Terminal color/theme system** — Use `picocolors` for styled output.
6. **Config validation with Zod** — Replace our bare interfaces with Zod schemas.

### Tier 2: Should-Have (Significant Value)
7. **Coding agent integrations** — `--claude`, `--codex`, etc. flags for `fix` command.
8. **Fix pipeline** — Plan → steps → apply → verify flow.
9. **Rule severity overrides in config** — Per-rule error/warning/off.
10. **Config extends** — Inherit from parent configs.
11. **GitHub Action** (`action.yml`) — For CI marketplace adoption.
12. **Score labels** — Healthy/Needs Work/Critical with configurable thresholds.
13. **JSON Schema for config** — Editor autocomplete.
14. **Grouped diagnostic output** — By engine, then by rule.

### Tier 3: Nice-to-Have (Polish)
15. **VS Code extension** — Editor integration.
16. **Pre-commit hooks** — `.pre-commit-hooks.yaml`.
17. **Score badge** — `deep-slop badge` command.
18. **Score trend tracking** — `deep-slop trend` command.
19. **Suppress directives** — `// deep-slop-disable-next-line`.
20. **Multi-language formatting/linting** — Wrap external tools (ruff, gofmt, etc.).
21. **Hallucinated import detection** — Check manifest for imported packages.
22. **Update notifier** — Check npm for newer versions.
23. **Telemetry** — Usage tracking (opt-out).
24. **Source masking** — Redact secrets in output.

---

## Summary

**aislop is a mature, production-ready product (v0.12.0)** with 37 command files, 28 detector files, 40+ test files, SARIF output, VS Code extension, GitHub Action, pre-commit hooks, and a sophisticated scoring system. It focuses on being a **unified quality gate** that wraps existing tools (biome, oxlint, ruff, knip) plus custom AI-slop detectors.

**deep-slop is a maturing project (v1.6.0)** with stronger specialization (18 engines vs 6, tree-sitter AST, import intelligence, suggestion system, AST parse cache) but still growing integration breadth.

**Our competitive advantages**: Tree-sitter AST analysis, alternative import path suggestions, barrel optimization, import graph analysis, granular per-feature config, suggestion system with confidence scores.

**Our critical gaps**: Scoring system, SARIF output, CI integrations, fix pipeline, terminal output quality, config validation. These should be addressed in priority order.
