<div align="center">

# deep-slop

**Deep AI Slop Detection — 14 AST-Powered Engines, 150+ Rules**

Detect AI-generated slop, dead code, security vulnerabilities, import problems,
and architectural decay in your codebase. Tree-sitter AST analysis, density-aware
scoring, MCP server, VS Code extension, and multi-language linting.

[![CI](https://github.com/cardtest15-coder/deep-slop/actions/workflows/ci.yml/badge.svg)](https://github.com/cardtest15-coder/deep-slop/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/deep-slop.svg)](https://www.npmjs.com/package/deep-slop)
[![license](https://img.shields.io/npm/l/deep-slop.svg)](https://github.com/cardtest15-coder/deep-slop/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/deep-slop.svg)](https://www.npmjs.com/package/deep-slop)
[![score](https://img.shields.io/badge/self--scan-57%2F100-yellow.svg)](https://github.com/cardtest15-coder/deep-slop)

</div>

---

## Why deep-slop?

AI coding assistants are fast — but they leave fingerprints: narrative comments,
empty catch blocks, hallucinated imports, `as any` casts, copy-paste patterns,
and silently swallowed errors. Traditional linters miss these because they
weren't designed to detect *AI-authored code quality decay*.

**deep-slop** is purpose-built to find and fix AI slop with real AST analysis
(tree-sitter), not regex hacks. It goes beyond AI-slop detection to cover
security, dead code, type safety, architecture, performance, i18n, and
configuration — 14 specialized engines, 150+ rules, one unified quality gate.

---

## Quick Start

```bash
# Scan your project immediately — no install needed
npx deep-slop scan .

# Or install globally
npm install -g deep-slop
deep-slop scan .
```

Output includes a density-aware quality score (0–100), per-engine diagnostics,
and actionable suggestions:

```
  deep-slop scanning: /home/user/my-project

  ⏳ ast-slop.............. ✅ 14 issues (120ms)
  ⏳ import-intelligence... ✅ 6 issues (85ms)
  ⏳ dead-flow............. ✅ 3 issues (45ms)
  ⏳ type-safety........... ✅ 2 issues (30ms)
  ⏳ syntax-deep........... ✅ 0 issues (20ms)
  ⏳ security-deep......... ✅ 1 issues (60ms)
  ⏳ arch-constraints...... ✅ 2 issues (35ms)
  ⏳ dup-detect............ ⏭️ skipped
  ⏳ perf-hints............ ✅ 1 issues (25ms)
  ⏳ i18n-lint............. ⏭️ skipped
  ⏳ config-lint........... ✅ 0 issues (10ms)
  ⏳ meta-quality.......... ✅ 1 issues (5ms)
  ⏳ knip................... ✅ 4 issues (150ms)
  ⏳ arch-rules............ ⏭️ no rules.yml
  ⏳ lint-external......... ⏭️ skipped

  Score: 72/100 (Needs Work) | Errors: 3 | Warnings: 11 | Info: 16 | Suggestions: 0
```

---

## Install

```bash
# npm
npm install -g deep-slop

# pnpm
pnpm add -g deep-slop

# yarn
yarn global add deep-slop

# One-off (no install)
npx deep-slop scan .
```

**Requirements:** Node.js >= 20

---

## The 14 Engines

### 1. ast-slop — AI Slop Pattern Detection (20+ rules)

Detects hallmarks of AI-authored code:

| Rule | Severity | Description |
|------|----------|-------------|
| `empty-catch` | strict | Empty catch blocks silently swallow errors |
| `narrative-comment` | strict | Comments that describe WHAT instead of WHY |
| `hallucinated-import` | standard | Imports from non-existent packages |
| `as-any-cast` | standard | `as any` casts disabling type safety |
| `generic-naming` | advisory | Variables like `data`, `result`, `item`, `info` |
| `decorative-comment` | style | Visual separator blocks (`// ===`, `// ───`) |
| `console-leftover` | style | Debug `console.log`/`console.debug` statements |
| `trivial-comment` | mechanical | Comments that restate the obvious |
| `todo-leftover` | mechanical | TODO comments with AI agent attribution |
| `unnecessary-abstraction` | maintainability | Overly ceremonial class/module patterns |
| `silent-recovery` | strict | Unnecessary try-catch wrapping that hides failures |
| `hardcoded-config` | standard | Configuration values baked into source |
| `copy-paste-signature` | mechanical | Copy-paste patterns differing only in identifiers |
| `boilerplate-structure` | mechanical | Overly ceremonial patterns (AI template signature) |
| `ai-emoji-comment` | style | Emoji in comments (common AI agent signature) |
| `overly-defensive` | advisory | Unnecessary null checks or defensive wrapping |
| `todo-stub` | mechanical | TODO/FIXME stubs left by AI agents |
| ...and more | | |

### 2. import-intelligence — Import Path Optimization (7 rules)

| Rule | Description |
|------|-------------|
| `alternative-path` | Suggest tree-shakeable imports (e.g., `lodash/map` instead of `lodash`) |
| `barrel-optimization` | Skip barrel files, import from source |
| `circular-dependency` | Detect import cycles in the dependency graph |
| `unused-import` | Imported but never referenced |
| `duplicate-import` | Multiple import statements from the same module |
| `broken-alias` | Path alias that doesn't map to an existing file |
| `barrel-bypass` | Direct import past barrel re-export |

### 3. dead-flow — Unreachable & Unused Code (7 rules)

| Rule | Description |
|------|-------------|
| `unreachable-after-terminator` | Code after `return`/`throw`/`break` |
| `dead-conditional` | Conditionals that always evaluate the same way |
| `unused-export` | Exported symbols with no consumers |
| `unused-variable` | Declared but never read |
| `empty-block` | Empty `if`/`for`/`while`/`try`/`catch` blocks |
| `dead-switch-case` | Unreachable switch cases after `default` |
| `dead-conditional` | Logic errors or AI artifacts |

### 4. type-safety — TypeScript Type Enforcement (6 rules)

| Rule | Description |
|------|-------------|
| `as-any-cast` | `as any` casts with context-aware type suggestions |
| `double-assertion` | `as unknown as X` bypass patterns |
| `ts-suppress` | `@ts-ignore` and `@ts-expect-error` directives |
| `non-null-assertion` | `!` operator without null checks |
| `generic-any` | `any` used as generic parameter (`Array<any>`) |
| `missing-return-type` | Functions without explicit return types |

### 5. syntax-deep — Syntax Anomaly Detection (12 rules)

BOM characters, CRLF line endings, mixed indentation, escape sequences, regex
issues, floating-point precision loss, Unicode anomalies (zero-width spaces,
RTL overrides, homoglyphs), trailing whitespace, NUL bytes, shebang mismatches,
and leftover git merge conflict markers.

### 6. security-deep — Security Vulnerability Detection (10 rules)

| Rule | Description |
|------|-------------|
| `eval-usage` | `eval()`, `new Function()`, `vm.runInContext` |
| `innerhtml-usage` | Direct `innerHTML` assignment (XSS risk) |
| `sql-injection` | String concatenation in SQL queries |
| `shell-injection` | Unsanitized `exec()`/`spawn()` arguments |
| `ssrf-risk` | Server-side request forgery patterns |
| `prototype-pollution` | Deep merge without prototype guard |
| `hardcoded-secret` | API keys, tokens, passwords in source |
| `dependency-vulnerability` | Known vulnerable dependencies |
| `xss-risk` | Cross-site scripting attack vectors |
| `unsafe-html` | Unsafe HTML operations |

### 7. arch-constraints — Architecture Analysis (6 rules)

| Rule | Description |
|------|-------------|
| `circular-dependency` | Module dependency cycles (via graphology) |
| `high-coupling` | High fan-in/fan-out modules |
| `layer-violation` | Imports that violate defined layer boundaries |
| `god-file` | Files concentrating too many responsibilities |
| `deep-nesting` | Excessive nesting depth |
| `unstable-dependency` | Fragile dependency patterns |

### 8. dup-detect — Duplicate Code Detection (5 rules)

Identical AST subtrees, similar blocks (copy-paste with minor edits), duplicate
imports across files, repeated constants, and copy-paste divergence patterns.

### 9. perf-hints — Performance Anti-Patterns (6 rules)

N+1 query patterns, missing React memoization (`React.memo`/`useMemo`/`useCallback`),
synchronous operations in async context, large allocations in loops, unnecessary
awaits, and string concatenation in loops.

### 10. i18n-lint — Internationalization Issues (4 rules)

Hardcoded strings in JSX/props, missing translation keys, locale mismatches
across locale files, and untranslated strings.

### 11. config-lint — Configuration Validation (6 rules)

tsconfig issues, ESLint misconfig, package script problems, Prettier config,
Vite config, and EditorConfig inconsistencies.

### 12. meta-quality — Scoring & Quality Gate (4 rules)

Score report quality, trend analysis/regression detection, quality gate
enforcement, and config sanity checks.

### 13. knip — Unused Dependency/Export Detection

Integrates [knip](https://github.com/webpro/knip) to find unused dependencies,
unused exports, and dead code that the AST engines may miss.

### 14. arch-rules — Custom Architecture Rules

Load custom rules from `.deep-slop/rules.yml`:

```yaml
rules:
  - id: forbid-lodash-default-import
    message: "Use specific lodash imports for tree-shaking"
    severity: warning
    pattern: "import _ from 'lodash'"
  - id: no-direct-api-from-ui
    message: "UI components must use service layer, not call API directly"
    severity: error
    forbid_import_from_path:
      from: "src/ui/**"
      import: "src/api/**"
```

### 15. lint-external — Multi-Language Linters

Wraps external linters for non-TypeScript code:

| Language | Tool |
|----------|------|
| Python | [ruff](https://docs.astral.sh/ruff/) |
| Go | [golangci-lint](https://golangci-lint.run/) |
| Rust | [clippy](https://doc.rust-lang.org/clippy/) |

---

## CLI Commands

### `deep-slop scan [path]`

Scan a project directory for issues.

```bash
deep-slop scan .                                    # Full scan
deep-slop scan ./src                                # Scan specific directory
deep-slop scan . --json                             # JSON output
deep-slop scan . --sarif                            # SARIF 2.1.0 output (GitHub code scanning)
deep-slop scan . --engine ast-slop type-safety      # Run specific engines
deep-slop scan . --exclude "**/*.test.ts"           # Exclude patterns
deep-slop scan . --severity warning                 # Only warnings and above
deep-slop scan . --changes                          # Only git-changed files
deep-slop scan . --staged                           # Only git-staged files
deep-slop scan . --base main                        # Compare against branch
```

### `deep-slop fix [path]`

Auto-fix detected issues with AST-based safe transforms.

```bash
deep-slop fix .                     # Fix all fixable issues
deep-slop fix . --engine ast-slop   # Fix only one engine's issues
deep-slop fix . --safe              # Only safe fixes (confidence >= 0.8)
deep-slop fix . --force             # Apply all fixes, including low-confidence
deep-slop fix . --dry-run           # Preview without modifying files
```

The fix pipeline: **scan → collect fixable diagnostics → plan → apply → verify → re-scan**.
If verification fails, changes are rolled back automatically.

### `deep-slop ci [path]`

CI mode — structured output with quality gate.

```bash
deep-slop ci .                      # Fail below default threshold (50)
deep-slop ci . --fail-below 70      # Custom threshold
deep-slop ci . --format sarif       # SARIF for GitHub code scanning
deep-slop ci . --format json        # JSON output
deep-slop ci . --changes            # Only changed files
deep-slop ci . --staged             # Only staged files
```

Exit code 1 if score is below threshold. Perfect for CI pipelines.

### `deep-slop rules`

List and search all available rules.

```bash
deep-slop rules                     # List all rules
deep-slop rules --search unused     # Fuzzy search by name/description
```

### `deep-slop badge [path]`

Generate a shields.io quality score badge for your README.

```bash
deep-slop badge .                   # Output badge URL
deep-slop badge . --json            # JSON with URL + markdown
deep-slop badge . --owner cardtest15-coder --repo deep-slop
```

### `deep-slop discover [path]`

Detect languages, frameworks, and tooling in the project.

```bash
deep-slop discover .                # Show detected languages/frameworks
```

### `deep-slop doctor [path]`

Check which external tools are available (ruff, golangci-lint, clippy, knip, etc.).

```bash
deep-slop doctor .                  # Show toolchain coverage
```

### `deep-slop init [path]`

Scaffold configuration and CI workflow.

```bash
deep-slop init .                    # Create .deep-slop/config.yml
deep-slop init . --preset typescript-strict   # From preset
deep-slop init . --strict           # Maximum strictness
```

### `deep-slop hook`

Manage git hooks for automated scanning.

```bash
deep-slop hook install              # Install pre-commit hook
deep-slop hook uninstall            # Remove pre-commit hook
deep-slop hook status               # Show hook status
deep-slop hook baseline             # Capture quality baseline
```

### `deep-slop agent [path]`

AI agent integration for automated repair.

```bash
deep-slop agent .                   # Start interactive agent session
deep-slop agent . --claude          # Use Claude for repairs
deep-slop agent . --cursor          # Use Cursor for repairs
deep-slop agent . --dry-run         # Preview repairs without applying
```

Supported agents: `--claude`, `--codex`, `--cursor`, `--windsurf`, `--aider`,
`--amp`, `--gemini`, `--goose`, `--opencode`, `--warp`, `--pi`, `--crush`.

### `deep-slop history [path]`

Show local score history with sparklines.

```bash
deep-slop history .                 # Show score trend
deep-slop history . --limit 20      # Last 20 scans
```

### `deep-slop watch [path]`

Watch mode — re-scan on file changes.

```bash
deep-slop watch .                   # Watch and re-scan on changes
```

### `deep-slop commands`

List all commands and their flags.

```bash
deep-slop commands
```

---

## MCP Server

deep-slop ships a [Model Context Protocol](https://modelcontextprotocol.io/) server
for integration with AI coding agents (Claude Code, Cursor, Windsurf, Aider, etc.).

### Setup

Add to your MCP client config (`.cursor/mcp.json`, `.claude/settings.json`, etc.):

```json
{
  "mcpServers": {
    "deep-slop": {
      "command": "npx",
      "args": ["-y", "deep-slop-mcp"]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "deep-slop": {
      "command": "deep-slop-mcp"
    }
  }
}
```

### MCP Tools (7 tools)

| Tool | Description |
|------|-------------|
| `deep_slop_scan` | Full project scan with configurable engines, severity filtering, and assessment |
| `deep_slop_fix` | Auto-fix issues: scan → fix → verify → re-scan |
| `deep_slop_why` | Explain why a rule flagged specific code (impact tier, rationale, doc link) |
| `deep_slop_engines` | List all 14 engines and their rule counts |
| `deep_slop_rules` | List/search all rules with metadata (severity, tier, fixable) |
| `deep_slop_score` | Quick quality score check (fast, minimal output) |
| `deep_slop_baseline` | Check quality baseline before making changes |

---

## VS Code Extension

Install the `deep-slop` extension from the VS Code marketplace for inline diagnostics.

**Features:**
- Diagnostics in the Problems panel
- Scan workspace or current file via commands
- Optional auto-scan on save

**Configuration:**

| Setting | Default | Description |
|---------|---------|-------------|
| `deep-slop.path` | `""` | Path to deep-slop CLI (auto-detected if empty) |
| `deep-slop.scanOnSave` | `false` | Auto-scan on save |
| `deep-slop.autoScan` | `false` | Auto-scan on activation |

**Commands:**
- `deep-slop: Scan Workspace`
- `deep-slop: Scan Current File`

See [`editors/vscode/`](editors/vscode/) for the extension source.

---

## GitHub Action

Use deep-slop as a GitHub Action in your CI:

```yaml
steps:
  - uses: cardtest15-coder/deep-slop@main
    with:
      directory: "."
      fail-below: "50"
      format: "sarif"
      node-version: "20"
      version: "latest"
```

**Inputs:**

| Input | Default | Description |
|-------|---------|-------------|
| `directory` | `.` | Directory to scan |
| `node-version` | `20` | Node.js version |
| `format` | `sarif` | Output format (human, json, sarif) |
| `fail-below` | `50` | Fail if score below threshold (0–100) |
| `version` | `latest` | deep-slop CLI version |

SARIF output integrates with [GitHub code scanning](https://docs.github.com/en/code-security/code-scanning).

---

## Pre-commit Hook

Add deep-slop as a [pre-commit](https://pre-commit.com/) hook:

```yaml
repos:
  - repo: https://github.com/cardtest15-coder/deep-slop
    rev: v0.7.0
    hooks:
      - id: deep-slop
```

Or install via the CLI:

```bash
deep-slop hook install
```

---

## Scoring System

deep-slop uses a **density-aware logarithmic scoring** system (0–100 scale):

```
score = 100 - (100 × log1p(scaledDeduction)) / log1p(100 + scaledDeduction)
```

Where:
- **density** = min(1, actionable_issues / (file_count + smoothing))
- **scaledDeduction** = totalDeduction × density
- **totalDeduction** = sum(severityWeight × ruleMultiplier × engineWeight)
- Per-rule **caps** prevent noisy rules from dominating the score

### Impact Tiers

Each rule is classified into one of 6 tiers:

| Tier | Multiplier | Cap | Example Rules |
|------|-----------|-----|---------------|
| **strict** | 1.0× | 40 | Empty catch, eval usage, hardcoded secrets, circular deps |
| **standard** | 1.0× | 30 | Hallucinated imports, as-any casts, broken aliases |
| **maintainability** | 0.75× | 24 | High coupling, layer violations, N+1 queries |
| **mechanical** | 0.5× | 16 | Unused imports, trailing whitespace, BOM characters |
| **style** | 0.5× | 8 | Decorative comments, console leftovers, precision loss |
| **advisory** | 0.25× | 8 | Generic naming, missing React memo, hardcoded strings |

### Score Labels

| Score | Label |
|-------|-------|
| >= 75 | **Healthy** |
| >= 50 | **Needs Work** |
| < 50 | **Critical** |

### Severity Weights

| Severity | Weight |
|----------|--------|
| error | 10 |
| warning | 3 |
| info | 1 |
| suggestion | 0.25 |

---

## Configuration

Create `.deep-slop/config.yml` in your project root:

```yaml
# .deep-slop/config.yml

# ── Engine selection (all enabled by default) ──
engines:
  ast-slop: true
  import-intelligence: true
  dead-flow: true
  type-safety: true
  syntax-deep: true
  security-deep: true
  arch-constraints: true
  dup-detect: true
  perf-hints: true
  i18n-lint: false          # Disable for non-i18n projects
  config-lint: true
  meta-quality: true
  knip: true
  arch-rules: true
  lint-external: false      # Requires external tools installed

# ── Quality thresholds ──
quality:
  maxFunctionLoc: 50        # Max lines per function
  maxFileLoc: 300           # Max lines per file
  maxNesting: 4             # Max nesting depth
  maxParams: 5              # Max function parameters
  maxCyclomatic: 10         # Max cyclomatic complexity
  maxCoupling: 10           # Max fan-in/fan-out

# ── Security settings ──
security:
  audit: true               # Run npm audit
  auditTimeout: 60          # Audit timeout in seconds
  owasp: true               # OWASP top-10 checks

# ── Import intelligence ──
imports:
  suggestAlternatives: true # Suggest tree-shakeable paths
  optimizeBarrels: true     # Flag barrel file imports
  validateAliases: true     # Check tsconfig path aliases
  buildGraph: true          # Build import dependency graph
  maxCircularDepth: 5       # Max circular dep depth

# ── Type safety ──
types:
  flagAsAny: true           # Flag `as any` casts
  suggestTypes: true        # Suggest concrete types
  flagDoubleAssertion: true # Flag `as unknown as X`

# ── Dead code ──
deadCode:
  unreachableBranches: true
  unusedExports: true
  unusedVariables: true

# ── i18n ──
i18n:
  hardcodedStrings: true
  validateKeys: false       # Enable if you have locale files

# ── Scoring ──
scoring:
  mode: logarithmic         # logarithmic or linear
  failBelow: 50             # CI quality gate threshold

# ── Rule severity overrides ──
rules:
  ast-slop/generic-naming: off       # Turn off a rule
  security-deep/eval-usage: error    # Promote to error
  type-safety/missing-return-type: warning  # Demote to warning

# ── Exclude patterns ──
exclude:
  - node_modules
  - .git
  - dist
  - build
  - coverage
  - tmp-*

# ── CI quality gate ──
ci:
  failBelow: 50            # Fail if score below this threshold
  format: json             # Output format for CI
  failOnErrors: true       # Also fail on any error-level diagnostic
```

### Config Inheritance

Extend from presets or parent configs:

```yaml
extends: typescript-strict   # Built-in preset name

# Override specific settings
quality:
  maxFileLoc: 400           # Relax from preset's 200
```

### Custom Architecture Rules

Create `.deep-slop/rules.yml`:

```yaml
rules:
  - id: no-business-logic-in-ui
    message: "Business logic must not live in UI components"
    severity: error
    forbid_import_from_path:
      from: "src/components/**"
      import: "src/services/**"

  - id: no-moment-js
    message: "Use date-fns instead of moment.js for tree-shaking"
    severity: warning
    forbid_import: "moment"
```

### Presets

| Preset | Description |
|--------|-------------|
| `typescript-strict` | Strict scoring, all engines, error thresholds (failBelow: 80) |
| `monorepo-relaxed` | Relaxed for monorepos, excludes common monorepo paths (failBelow: 60) |
| `python-go` | Optimized for Python + Go — enables lint-external, disables config-lint |
| `minimal` | Only ast-slop + security-deep — lightweight scanning |

```bash
deep-slop init . --preset typescript-strict
```

---

## Programmatic API

```typescript
import { runScan, DEFAULT_CONFIG, type ScanResult } from "deep-slop";

const result: ScanResult = await runScan({
  rootDirectory: "/path/to/project",
  languages: ["typescript"],
  frameworks: ["react"],
  files: ["src/index.ts"],
  installedTools: {},
  config: DEFAULT_CONFIG,
});

console.log(`Score: ${result.score}/100 (${result.label})`);
console.log(`Errors: ${result.bySeverity.error}`);
console.log(`Warnings: ${result.bySeverity.warning}`);
```

---

## deep-slop vs aislop

| Feature | aislop | deep-slop |
|---------|--------|-----------|
| Detection engines | 6 | **14** |
| Analysis method | Regex-based | **AST (tree-sitter)** |
| AI slop rules | 13 | **20+** |
| Alternative import paths | No | **Yes** — tree-shakeable suggestions |
| Type safety analysis | No | **Yes** — `as any`, double assertions, `@ts-ignore` |
| Dead code flow | Via knip | **AST-native** — unreachable, unused exports/variables |
| Architecture analysis | Basic | **Yes** — circular deps, coupling, layer violations, god files |
| Duplicate code detection | No | **Yes** — structural + copy-paste patterns |
| Performance hints | No | **Yes** — N+1, memoization, sync-in-async |
| i18n linting | No | **Yes** — hardcoded strings, missing keys, locale mismatches |
| Config validation | No | **Yes** — tsconfig, ESLint, Vite, Prettier, EditorConfig |
| Custom architecture rules | Yes (rules.yml) | **Yes** (rules.yml with matchers) |
| MCP Server | 4 tools | **7 tools** (scan, fix, why, engines, rules, score, baseline) |
| Scoring | Density-aware logarithmic | **Density-aware logarithmic** + per-rule caps |
| Impact tiers | 6 tiers | **6 tiers** (strict → advisory) |
| Auto-fix pipeline | Plan → apply → verify | **Plan → apply → verify → rollback** |
| SARIF output | Yes | **Yes** — GitHub code scanning |
| VS Code extension | Yes | **Yes** — Problems panel + auto-scan |
| GitHub Action | Yes | **Yes** — configurable inputs |
| Pre-commit hook | Yes | **Yes** |
| Config presets | No | **4 presets** (typescript-strict, monorepo-relaxed, python-go, minimal) |
| Config inheritance | Yes (extends) | **Yes** (extends) |
| Rule severity overrides | Yes | **Yes** — per-rule error/warning/info/off |
| Score badge | Yes | **Yes** |
| Score history | Yes (trend) | **Yes** (history + sparklines) |
| Watch mode | No | **Yes** — re-scan on file changes |
| Multi-language linting | oxlint, ruff, golangci-lint, clippy, rubocop | **ruff, golangci-lint, clippy** |
| AI agent repair | 16 agent flags | **12 agent flags** + repair loop |
| Doctor command | Yes | **Yes** — toolchain coverage check |
| Discover command | No | **Yes** — language/framework detection |

---

## Self-Scan

deep-slop runs on itself. Current score: **57/100 (Needs Work)**.

We practice what we preach — our own codebase is scanned and scored by deep-slop,
and we're actively working to improve it.

---

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Type-check
pnpm typecheck

# Run tests
pnpm test

# Scan the project itself
pnpm scan

# JSON output
pnpm scan:json
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes and add tests
4. Run the test suite (`pnpm test`)
5. Ensure the project type-checks (`pnpm typecheck`)
6. Scan for slop (`pnpm scan`) — we hold ourselves to the same standard
7. Commit with a descriptive message
8. Open a pull request

**Adding a new rule:**
1. Add the rule to the appropriate engine in `src/engines/<engine>/index.ts`
2. Add rule impact classification in `src/scoring/rule-impact.ts`
3. Add display label in `src/output/rule-labels.ts`
4. If fixable, add to `FIXABLE_RULES` in `src/engines/catalog.ts`
5. Add tests in `src/engines/<engine>/index.test.ts`

**Adding a new engine:**
1. Create `src/engines/<name>/index.ts` implementing the `Engine` interface
2. Register in `src/engines/orchestrator.ts`
3. Add to `src/types/index.ts` `EngineName` type
4. Add preset entries in `src/config/presets.ts`
5. Add engine info in the MCP `deep_slop_engines` tool

---

## License

[MIT](LICENSE) &copy; Romanchello 2026

---

<div align="center">

**[Report Bug](https://github.com/cardtest15-coder/deep-slop/issues)** &middot;
**[Request Feature](https://github.com/cardtest15-coder/deep-slop/issues)** &middot;
**[npm](https://www.npmjs.com/package/deep-slop)** &middot;
**[GitHub Action](action.yml)** &middot;
**[VS Code Extension](editors/vscode/)**

</div>
