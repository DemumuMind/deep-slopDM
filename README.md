<div align="center">

# deep-slop

**Deep AI Slop Detection — 18 AST-Powered Engines, 181+ Rules**

Detect AI-generated slop, dead code, security vulnerabilities, import problems,
and architectural decay in your codebase. Tree-sitter AST analysis for 8 languages,
density-aware scoring, SARIF 2.1.0 output, MCP server,
16 AI agent providers, and multi-language linting across 14 languages.

[![CI](https://github.com/DemumuMind/deep-slopDM/actions/workflows/ci.yml/badge.svg)](https://github.com/DemumuMind/deep-slopDM/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/deep-slop.svg)](https://www.npmjs.com/package/deep-slop)
[![license](https://img.shields.io/npm/l/deep-slop.svg)](https://github.com/DemumuMind/deep-slopDM/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/deep-slop.svg)](https://www.npmjs.com/package/deep-slop)
[![tests](https://img.shields.io/badge/tests-197%20passed-brightgreen.svg)](https://github.com/DemumuMind/deep-slopDM)

</div>

---

## Why deep-slop?

AI coding assistants are fast — but they leave fingerprints: narrative comments,
empty catch blocks, hallucinated imports, `as any` casts, copy-paste patterns,
and silently swallowed errors. Traditional linters miss these because they
weren't designed to detect *AI-authored code quality decay*.

**deep-slop** is purpose-built to find and fix AI slop with real AST analysis
(tree-sitter), not regex hacks. It goes beyond AI-slop detection to cover
security, dead code, type safety, architecture, performance, i18n, formatting,
framework anti-patterns, and markup quality — 18 specialized engines, 181+ rules,
one unified quality gate.

---

## Quick Start

```bash
# Scan your project immediately — no install needed
npx deep-slop scan .

# SARIF output for GitHub Code Scanning
npx deep-slop scan . --sarif

# Scan only specific paths
npx deep-slop scan . --include "src/**/*.ts"

# Or install globally
npm install -g deep-slop
deep-slop scan .
```

Output includes a density-aware quality score (0–100), per-engine diagnostics,
top findings, and actionable suggestions:

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
  ⏳ format-lint........... ✅ 3 issues (15ms)
  ⏳ framework-lint........ ✅ 5 issues (40ms)
  ⏳ markup-lint........... ✅ 2 issues (30ms)

  ▸ Top findings:
    1. ast-slop/narrative-comment   — src/utils.ts:42
    2. security-deep/hardcoded-secret — src/config.ts:12
    3. dead-flow/unreachable-after-terminator — src/handler.ts:88

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

## CLI Commands

| Command | Description |
|---------|-------------|
| `scan [path]` | Scan project for AI slop and quality issues |
| `fix [path]` | Auto-fix detected issues with AST-based safe transforms |
| `ci [path]` | CI mode — structured output with quality gate |
| `rules` | List, search, or show details for all 181+ rules |
| `init [path]` | Scaffold configuration and CI workflow |
| `doctor [path]` | Check environment for deep-slop compatibility |
| `trend [path]` | Show score trend across recent scans |
| `watch [path]` | Watch for file changes and auto-scan |
| `hook` | Manage hooks for AI coding tools (install/uninstall/status/baseline/audit/sentinel) |
| `agent` | AI agent-powered repair commands (repair/plan/use/sessions) |
| `badge [path]` | Generate a shields.io quality score badge |
| `update` | Check for and install deep-slop updates |

### `deep-slop scan [path]`

Scan a project directory for issues.

```bash
deep-slop scan .                                    # Full scan
deep-slop scan ./src                                # Scan specific directory
deep-slop scan . --json                             # JSON output
deep-slop scan . --sarif                            # SARIF 2.1.0 output (GitHub Code Scanning)
deep-slop scan . --include "src/**/*.ts"            # Include only matching files
deep-slop scan . --engine ast-slop type-safety      # Run specific engines
deep-slop scan . --exclude "**/*.test.ts"           # Exclude patterns
deep-slop scan . --severity warning                 # Only warnings and above
deep-slop scan . --changes                          # Only git-changed files
deep-slop scan . --staged                           # Only git-staged files
deep-slop scan . --base main                        # Compare against branch
deep-slop scan . --verbose                          # Verbose output with rule details
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
deep-slop ci . --format sarif       # SARIF for GitHub Code Scanning
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
deep-slop rules ast-slop/empty-catch # Show rule details with impact tier
```

### `deep-slop init [path]`

Scaffold configuration and CI workflow.

```bash
deep-slop init .                    # Create .deep-slop/config.yml
deep-slop init . --preset typescript-strict   # From preset
deep-slop init . --strict           # Maximum strictness (enterprise preset)
```

### `deep-slop doctor [path]`

Check which external tools are available (ruff, golangci-lint, clippy, knip, etc.).

```bash
deep-slop doctor .                  # Show toolchain coverage
```

### `deep-slop trend [path]`

Show score history with sparklines.

```bash
deep-slop trend .                   # Show score trend
deep-slop trend . --limit 20        # Last 20 scans
```

### `deep-slop watch [path]`

Watch mode — re-scan on file changes.

```bash
deep-slop watch .                   # Watch and re-scan on changes
```

### `deep-slop hook`

Manage git hooks and AI tool hooks for automated scanning.

```bash
deep-slop hook install              # Install pre-commit hook
deep-slop hook uninstall            # Remove pre-commit hook
deep-slop hook status               # Show hook status
deep-slop hook baseline             # Capture quality baseline
deep-slop hook audit                # Audit dependencies for vulnerabilities
deep-slop hook sentinel             # Run sentinel mode with auto-repair
```

**Runtime hooks** (full scan + fix): Claude, Cursor, Gemini, Pi
**Rules-only hooks** (pass diagnostics as context): Codex, Windsurf, Cline, Kilo, Copilot, Antigravity

### `deep-slop agent`

AI agent integration for automated repair.

```bash
deep-slop agent repair .                      # Start repair loop (default: Claude)
deep-slop agent repair . --provider codex     # Use Codex for repairs
deep-slop agent repair . --provider cursor    # Use Cursor for repairs
deep-slop agent repair . --target-score 80    # Target specific score
deep-slop agent plan .                        # Preview repair plan without applying
deep-slop agent use claude .                  # Set default provider for project
deep-slop agent sessions .                    # List all repair sessions
```

**16 providers:** `claude`, `codex`, `cursor`, `opencode`, `aider`, `goose`,
`windsurf`, `vscode`, `amp`, `gemini-cli`, `kimi`, `warp`, `pi`, `crush`,
`deep-agents`, `antigravity`

### `deep-slop badge [path]`

Generate a shields.io quality score badge for your README.

```bash
deep-slop badge .                   # Output badge URL
deep-slop badge . --json            # JSON with URL + markdown
deep-slop badge . --owner Romanchello --repo deep-slop
```

### `deep-slop update`

Self-update to the latest version.

```bash
deep-slop update                    # Check and install updates
deep-slop update --check            # Only check, do not install
```

---

## The 18 Engines

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
| `swallowed-exception` | strict | Exceptions caught and silently discarded |
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
| `unused-variable` | Declared but never read (`_`-prefixed vars skipped) |
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
| `deep-nesting` | Excessive nesting depth (context-aware thresholds) |
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

### 16. format-lint — Formatting Consistency (6 rules)

Detects formatting inconsistencies across all source files: mixed indentation,
inconsistent quote style, max line length violations, inconsistent semicolons,
blank line clusters, and trailing comma inconsistencies.

### 17. framework-lint — Framework-Specific Rules (15+ rules)

Framework-specific AI slop detection:

**Next.js rules** (8 rules): Misplaced `use client`, missing `use client`,
Pages Router APIs in App Router, `next/router` vs `next/navigation`, missing
Image dimensions, metadata in client components, hardcoded env vars, links
without ARIA labels.

**Tailwind CSS rules** (7 rules): `@apply` anti-pattern, inline style conflicts,
`!important` modifier, duplicate utilities, magic values, incomplete flex,
overloaded className strings.

### 18. markup-lint — Markup & Config Quality (20+ rules)

Quality checks for non-source files:

**JSON** (4 rules): Trailing commas, duplicate keys, inconsistent spacing, deep nesting.
**YAML** (4 rules): Tab indentation, duplicate keys, complex anchors, missing document separators.
**CSS** (4 rules): Unused selectors, `!important` overuse, duplicate properties, universal selectors.
**HTML** (4 rules): Missing `alt` on images, missing `lang`, deprecated tags, inline event handlers.
**Markdown** (4 rules): Broken links, inconsistent heading styles, TODOs in docs, missing fenced language.

### 19+. Plugin Engines

deep-slop supports custom plugin engines loaded from `.deep-slop/plugins/`.
Plugins implement the same `Engine` interface as built-in engines and appear
alongside them in scan output, scoring, and MCP tools.

See the [Plugin API](#plugin-api) section for details.

---

## Languages

deep-slop analyzes **14 languages** with Tree-sitter AST support for 8:

| Language | AST Analysis | Engines Active |
|----------|:------------:|----------------|
| TypeScript | ✅ tree-sitter | All engines |
| JavaScript | ✅ tree-sitter | All engines |
| TSX | ✅ tree-sitter | All + framework-lint |
| JSX | ✅ tree-sitter | All + framework-lint |
| Python | ✅ tree-sitter | ast-slop, syntax-deep, security-deep, lint-external (ruff) |
| Go | ✅ tree-sitter | ast-slop, syntax-deep, security-deep, lint-external (golangci-lint) |
| Rust | ✅ tree-sitter | ast-slop, syntax-deep, lint-external (clippy) |
| PHP | ✅ tree-sitter | ast-slop, syntax-deep, security-deep |
| C# | ✅ tree-sitter | ast-slop, syntax-deep |
| Swift | ✅ tree-sitter | ast-slop, syntax-deep |
| JSON | Text-based | markup-lint |
| YAML | Text-based | markup-lint, config-lint |
| CSS | Text-based | markup-lint, framework-lint (Tailwind) |
| HTML | Text-based | markup-lint |
| Markdown | Text-based | markup-lint |

> Score is withheld for projects where >80% of files are in unsupported languages.

---

## Frameworks

### Next.js

8 rules detecting common AI-authored Next.js anti-patterns:
- Misplaced or missing `'use client'` directives
- Pages Router APIs in App Router projects
- `next/router` instead of `next/navigation`
- Missing `<Image>` dimensions causing layout shift
- Metadata exports in client components
- Hardcoded URLs instead of environment variables
- Links without accessible text

### Tailwind CSS

7 rules catching AI-generated Tailwind slop:
- `@apply` negating utility-first approach
- Inline style conflicts with Tailwind classes
- `!important` modifier indicating specificity issues
- Duplicate/conflicting utilities in same className
- Arbitrary magic values instead of theme scale
- Bare `flex` without alignment (likely incomplete)
- Overloaded className strings needing extraction

---

## Configuration

### `.deep-slop/config.yml`

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
  format-lint: true
  framework-lint: true
  markup-lint: true

# ── Quality thresholds ──
quality:
  maxFunctionLoc: 50        # Max lines per function
  maxFileLoc: 300           # Max lines per file
  maxNesting: 4             # Max nesting depth
  maxParams: 5              # Max function parameters
  maxCyclomatic: 10         # Max cyclomatic complexity
  maxCoupling: 10           # Max fan-in/fan-out

# ── Context-aware complexity thresholds ──
# Rust: 2.5x, Go: 1.5x, TSX: 1.5x multiplier on maxCyclomatic

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
  unusedVariables: true     # _-prefixed vars skipped

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

### `.deep-slopignore`

Exclude files from scanning with a `.deep-slopignore` file (gitignore-style patterns):

```
# .deep-slopignore
node_modules/
dist/
*.min.js
*.d.ts
coverage/
```

### Suppress Directives

Suppress specific rules inline in source files:

```typescript
// deep-slop-ignore-next ast-slop/narrative-comment
// This comment explains WHY, not what — intentional
const result = compute(data);

// deep-slop-ignore-line ast-slop/generic-naming
const info = getData();

/* deep-slop-ignore-start ast-slop/console-leftover */
console.log('debug temp');
/* deep-slop-ignore-end ast-slop/console-leftover */
```

**Directive forms:** `deep-slop-ignore-next`, `deep-slop-ignore-line`,
`deep-slop-ignore-start` / `deep-slop-ignore-end`

### `--include` Option

Scan only specific file patterns:

```bash
deep-slop scan . --include "src/**/*.ts"
deep-slop scan . --include "src/**/*.ts" --include "lib/**/*.js"
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
deep-slop init . --strict           # Enterprise preset (maximum strictness)
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

### MCP Tools (7+ tools)

| Tool | Description |
|------|-------------|
| `deep_slop_scan` | Full project scan with configurable engines, severity filtering, and assessment |
| `deep_slop_fix` | Auto-fix issues: scan → fix → verify → re-scan |
| `deep_slop_why` | Explain why a rule flagged specific code (impact tier, rationale, doc link) |
| `deep_slop_engines` | List all 18 engines and their rule counts |
| `deep_slop_rules` | List/search all 181+ rules with metadata (severity, tier, fixable) |
| `deep_slop_score` | Quick quality score check (fast, minimal output) |
| `deep_slop_baseline` | Check quality baseline before making changes |

---

## CI Integration

### GitHub Actions Composite Action

Use deep-slop as a composite GitHub Action in your CI:

```yaml
steps:
  - uses: DemumuMind/deep-slopDM@main
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

### SARIF Upload to GitHub Code Scanning

```yaml
- uses: DemumuMind/deep-slopDM@main
  with:
    format: sarif
    fail-below: "70"

- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with:
    sarif_file: deep-slop-results.sarif
```

SARIF 2.1.0 output integrates with [GitHub code scanning](https://docs.github.com/en/code-security/code-scanning).

### `init --strict` Enterprise Preset

```bash
deep-slop init . --strict
```

Creates a strict configuration with `failBelow: 80`, all engines enabled,
and error-level severity for security and architecture rules. Ideal for
enterprise CI pipelines.

---

## Agent Integration

deep-slop integrates with **16 AI agent providers** for automated repair:

| Provider | Flag | Type |
|----------|------|------|
| Claude Code | `--provider claude` | Runtime (full scan + fix) |
| Codex | `--provider codex` | Runtime |
| Cursor | `--provider cursor` | Runtime |
| OpenCode | `--provider opencode` | Runtime |
| Aider | `--provider aider` | Runtime |
| Goose | `--provider goose` | Runtime |
| Windsurf | `--provider windsurf` | Runtime |
| VS Code | `--provider vscode` | Runtime |
| Amp | `--provider amp` | Runtime |
| Gemini CLI | `--provider gemini-cli` | Runtime |
| Kimi | `--provider kimi` | Runtime |
| Warp | `--provider warp` | Runtime |
| Pi | `--provider pi` | Runtime |
| Crush | `--provider crush` | Runtime |
| Deep Agents | `--provider deep-agents` | Runtime |
| Antigravity | `--provider antigravity` | Runtime |

### Repair Loop

```bash
deep-slop agent repair . --provider claude --target-score 80
```

The repair loop: **scan → diagnose → prompt agent → apply fixes → re-scan → repeat**
until the target score is reached or max turns exhausted.

### Agent Hooks

**Runtime hooks** (full scan + auto-fix): Claude, Cursor, Gemini, Pi
**Rules-only hooks** (pass diagnostics as context to the agent): Codex, Windsurf, Cline, Kilo, Copilot, Antigravity

### Auto PR with `--pr`

Create a pull request automatically after agent repair completes:

```bash
deep-slop agent repair . --provider claude --pr
```

---

## Plugin API

deep-slop supports custom plugin engines loaded from `.deep-slop/plugins/`.
Plugins implement the same `Engine` interface as built-in engines and appear
alongside them in scan output, scoring, and MCP tools.

### Plugin Structure

```
.deep-slop/
  plugins/
    my-engine/
      index.js      # Plugin entry point
```

### Plugin Interface

```typescript
interface Engine {
  name: string;                    // Unique engine identifier
  description: string;             // Human-readable description
  supportedLanguages: Language[];  // Languages this engine supports
  run(context: EngineContext): Promise<EngineResult>;
  fix?(diagnostics: Diagnostic[], context: EngineContext): Promise<FixResult>;
}
```

### Creating a Plugin

```javascript
// .deep-slop/plugins/my-engine/index.js
export const myEngine = {
  name: 'my-engine',
  description: 'Custom engine for project-specific checks',
  supportedLanguages: ['typescript', 'javascript'],
  async run(context) {
    const diagnostics = [];
    // Your analysis logic here
    return {
      engine: 'my-engine',
      diagnostics,
      elapsed: 0,
      skipped: false,
    };
  },
};
```

Plugins are auto-discovered and loaded after built-in engines. They can be
enabled/disabled in `.deep-slop/config.yml` just like built-in engines:

```yaml
engines:
  my-engine: true   # Enable custom plugin
```

---

---

## Pre-commit Hook

Add deep-slop as a [pre-commit](https://pre-commit.com/) hook:

```yaml
repos:
  - repo: https://github.com/DemumuMind/deep-slopDM
    rev: v1.6.0
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
- **Context-aware complexity thresholds**: Rust 2.5×, Go 1.5×, TSX 1.5× on maxCyclomatic
- **tsconfig path aliases** are respected for import resolution
- **`_`-prefixed unused variables** are skipped

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
| Detection engines | 6 | **18** |
| Analysis method | Regex-based | **AST (tree-sitter)** |
| Total rules | 13 | **181+** |
| AI slop rules | 13 | **20+** |
| Alternative import paths | No | **Yes** — tree-shakeable suggestions |
| Type safety analysis | No | **Yes** — `as any`, double assertions, `@ts-ignore` |
| Dead code flow | Via knip | **AST-native** — unreachable, unused exports/variables |
| Architecture analysis | Basic | **Yes** — circular deps, coupling, layer violations, god files |
| Duplicate code detection | No | **Yes** — structural + copy-paste patterns |
| Performance hints | No | **Yes** — N+1, memoization, sync-in-async |
| i18n linting | No | **Yes** — hardcoded strings, missing keys, locale mismatches |
| Config validation | No | **Yes** — tsconfig, ESLint, Vite, Prettier, EditorConfig |
| Framework rules | No | **Yes** — Next.js (8), Tailwind CSS (7) |
| Formatting consistency | No | **Yes** — indent, quotes, semicolons, trailing commas |
| Markup quality | No | **Yes** — JSON, YAML, CSS, HTML, Markdown |
| Custom architecture rules | Yes (rules.yml) | **Yes** (rules.yml with matchers) |
| Plugin API | No | **Yes** — custom engines from `.deep-slop/plugins/` |
| MCP Server | 4 tools | **7+ tools** (scan, fix, why, engines, rules, score, baseline) |
| Scoring | Density-aware logarithmic | **Density-aware logarithmic** + per-rule caps |
| Impact tiers | 6 tiers | **6 tiers** (strict → advisory) |
| Auto-fix pipeline | Plan → apply → verify | **Plan → apply → verify → rollback** |
| SARIF output | Yes | **Yes** — SARIF 2.1.0 for GitHub Code Scanning |
| Score withheld (unsupported lang) | No | **Yes** — null score when >80% unsupported |
| Editor extension | No | **Yes** — Problems panel + auto-scan |
| GitHub Action | Yes | **Yes** — composite action with SARIF upload |
| Pre-commit hook | Yes | **Yes** |
| Config presets | No | **4 presets** + `--strict` enterprise |
| Config inheritance | Yes (extends) | **Yes** (extends) |
| Rule severity overrides | Yes | **Yes** — per-rule error/warning/info/off |
| Suppress directives | No | **Yes** — next/line/start/end |
| Score badge | Yes | **Yes** |
| Score history | Yes (trend) | **Yes** (trend + sparklines) |
| Watch mode | No | **Yes** — re-scan on file changes |
| Multi-language linting | oxlint, ruff, golangci-lint, clippy, rubocop | **ruff, golangci-lint, clippy** |
| AI agent providers | 16 flags | **16 providers** + repair loop + sessions |
| Agent --pr auto PR | No | **Yes** |
| Context-aware thresholds | No | **Yes** — Rust 2.5×, Go 1.5×, TSX 1.5× |
| tsconfig alias support | No | **Yes** — path aliases respected |
| `_`-prefixed unused vars | Not skipped | **Skipped** |
| Self-update | No | **Yes** — `deep-slop update` |
| Top findings section | No | **Yes** — most impactful issues highlighted |
| Pattern docs | No | **Yes** — bad/good examples per rule |

---

## Performance

| Metric | Value |
|--------|-------|
| Self-scan time | ~2s (18 engines, 100+ files) |
| Package size | 282KB tarball |
| Memory usage | ~45MB peak |
| Cold start | ~300ms (with tree-sitter) |
| Test suite | 197 tests, all passing |
| Type-check | 0 TS errors |

---

## Self-Scan

deep-slop runs on itself. The self-scan score is captured by `pnpm scan` and
written to the project's history. We practice what we preach — our own codebase
is scanned and scored by deep-slop, and we use it to continuously improve code
quality.

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

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines, or:

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

**[Report Bug](https://github.com/DemumuMind/deep-slopDM/issues)** &middot;
**[Request Feature](https://github.com/DemumuMind/deep-slopDM/issues)** &middot;
**[npm](https://www.npmjs.com/package/deep-slop)** &middot;
**[GitHub Action](action.yml)** &middot;
**[Contributing](CONTRIBUTING.md)**

</div>
