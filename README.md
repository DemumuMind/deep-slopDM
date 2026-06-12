# deep-slop — Deep AI Slop Detection, 12 Engines, AST-Powered

> Detect AI-generated slop in your codebase with 12 specialized engines, tree-sitter AST analysis, alternative import suggestions, dead code flow analysis, and type safety checks. Far beyond regex-based linting.

[![CI](https://github.com/Romanchello/deep-slop/actions/workflows/ci.yml/badge.svg)](https://github.com/Romanchello/deep-slop/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/deep-slop.svg)](https://www.npmjs.com/package/deep-slop)
[![license](https://img.shields.io/npm/l/deep-slop.svg)](https://github.com/Romanchello/deep-slop/blob/main/LICENSE)

## Quick Start

```bash
# Scan your project immediately — no install needed
npx deep-slop scan .

# Or install globally
npm install -g deep-slop
deep-slop scan .
```

Output includes a quality score (0–100), per-engine diagnostics, and actionable suggestions:

```
  deep-slop scanning: /home/user/my-project

  ⏳ ast-slop... ✅ 14 issues (120ms)
  ⏳ import-intelligence... ✅ 6 issues (85ms)
  ⏳ dead-flow... ✅ 3 issues (45ms)
  ⏳ type-safety... ✅ 2 issues (30ms)
  ⏳ syntax-deep... ✅ 0 issues (20ms)
  ⏳ security-deep... ✅ 1 issues (60ms)
  ⏳ arch-constraints... ✅ 2 issues (35ms)
  ⏳ dup-detect... ⏭️ skipped
  ⏳ perf-hints... ✅ 1 issues (25ms)
  ⏳ i18n-lint... ⏭️ skipped
  ⏳ config-lint... ✅ 0 issues (10ms)
  ⏳ meta-quality... ✅ 1 issues (5ms)

  Score: 72/100 | Errors: 3 | Warnings: 11 | Info: 16 | Suggestions: 0
```

## Why deep-slop over aislop?

| Feature | aislop | deep-slop |
|---|---|---|
| Detection engines | 6 | **12** |
| Analysis method | Regex-based | **AST (tree-sitter)** |
| Alternative import paths | No | **Yes** — suggests tree-shakeable imports |
| Type safety analysis | No | **Yes** — `as any`, double assertions, `@ts-ignore` |
| Dead code flow analysis | No | **Yes** — unreachable code, unused exports/variables |
| Architecture analysis | No | **Yes** — circular deps, coupling, layer violations |
| Duplicate code detection | No | **Yes** — structural duplicates, copy-paste detection |
| Performance hints | No | **Yes** — N+1 patterns, memoization, sync-in-async |
| i18n linting | No | **Yes** — hardcoded strings, missing translation keys |
| Config validation | No | **Yes** — tsconfig, ESLint, bundler config checks |
| Type suggestions | No | **Yes** — context-aware type replacements |
| Security deep scan | Basic | **Deep** — eval, SSRF, prototype pollution, supply chain |
| MCP Server | No | **Yes** — 5 tools for AI agent integration |
| CI quality gate | Basic | **Weighted scoring** with configurable thresholds |
| Auto-fix | Limited | **AST-based safe transforms** (in progress) |
| Supported languages | JS/TS | **JS/TS, Python, Go, Rust, Ruby, PHP, Java** |

## The 12 Engines

### 1. ast-slop (10 rules)
AI-authored code pattern detection:
- **narrative-comment** — Comments that describe WHAT instead of WHY
- **decorative-comment** — Visual separator blocks (`// ===`, `// ───`)
- **console-leftover** — Debug `console.log`/`console.debug` statements
- **generic-name** — Variables like `data`, `result`, `item`, `info`
- **hallucinated-import** — Imports from non-existent packages
- **trivial-comment** — Comments that restate the obvious
- **boilerplate-structure** — Overly ceremonial class/module patterns
- **ai-emoji-comment** — Emoji in comments (common AI agent signature)
- **overly-defensive** — Unnecessary null checks or try-catch wrapping
- **todo-ai** — TODO comments with AI agent attribution

### 2. import-intelligence (7 rules)
Import path optimization and validation:
- **alternative-path** — Suggest tree-shakeable import alternatives (e.g., `lodash/X` instead of `lodash`)
- **barrel-optimization** — Skip barrel files, import from source
- **alias-validation** — Verify tsconfig path aliases resolve correctly
- **circular-dependency** — Detect import cycles in the dependency graph
- **unused-import** — Imported but never referenced
- **duplicate-import** — Multiple import statements from the same module
- **broken-alias** — Path alias that doesn't map to an existing file

### 3. dead-flow (7 rules)
Unreachable and unused code detection:
- **unreachable-after-terminator** — Code after `return`/`throw`/`break`
- **dead-conditional** — Conditionals that always evaluate the same way
- **unused-export** — Exported symbols with no consumers
- **unused-variable** — Declared but never read
- **empty-block** — Empty `if`/`for`/`while`/`try`/`catch` blocks
- **dead-switch-case** — Unreachable switch cases after `default`
- **redundant-else** — `else` after a terminating `if` block

### 4. type-safety (6 rules)
TypeScript type safety enforcement:
- **as-any** — `as any` casts with context-aware type suggestions
- **double-assertion** — `as unknown as X` bypass patterns
- **missing-return-type** — Functions without explicit return types
- **ts-suppress** — `@ts-ignore` and `@ts-expect-error` directives
- **non-null-assertion** — `!` operator without null checks
- **generic-any** — `any` used as generic parameter (`Array<any>`)

### 5. syntax-deep (12 rules)
Deep syntax anomaly detection:
- **bom-present** — UTF-8 BOM characters
- **crlf-line-endings** — CRLF in Unix projects
- **mixed-line-endings** — Inconsistent LF/CRLF mixing
- **escape-sequence** — Unusual or broken escape sequences
- **regex-issues** — Problematic regex patterns (catastrophic backtracking, etc.)
- **precision-loss** — Floating-point literals with >15 significant digits
- **unicode-anomaly** — Zero-width spaces, RTL overrides, control chars
- **trailing-whitespace** — Trailing spaces/tabs
- **tab-space-mix** — Mixed indentation in the same file
- **nul-byte** — NUL bytes in source files
- **shebang-mismatch** — Incorrect shebang lines
- **merge-marker** — Leftover git merge conflict markers

### 6. security-deep (7 rules)
Security vulnerability detection:
- **eval-usage** — `eval()`, `new Function()`, `vm.runInContext`
- **innerHTML** — Direct `innerHTML` assignment (XSS risk)
- **sql-injection** — String concatenation in SQL queries
- **shell-injection** — Unsanitized `exec()`/`spawn()` arguments
- **ssrf** — Server-side request forgery patterns
- **prototype-pollution** — Deep merge without prototype guard
- **hardcoded-secret** — API keys, tokens, passwords in source

### 7. arch-constraints (3 rules)
Architecture and dependency analysis:
- **circular-dependency** — Module dependency cycles (via graphology)
- **coupling-metrics** — High fan-in/fan-out modules
- **layer-violation** — Imports that violate defined layer boundaries

### 8. dup-detect (2 rules)
Structural duplicate detection:
- **structural-duplicate** — Identical AST subtrees
- **copy-paste-rename** — Similar blocks differing only in identifiers

### 9. perf-hints (4 rules)
Performance anti-pattern detection:
- **n-plus-1** — N+1 query patterns in loops
- **react-memoization** — Missing `React.memo`/`useMemo`/`useCallback`
- **sync-in-async** — Synchronous operations inside async functions
- **loop-allocation** — Unnecessary object allocations in hot loops

### 10. i18n-lint (3 rules)
Internationalization linting:
- **hardcoded-string** — Unwrapped strings in JSX/component templates
- **missing-translation-key** — Keys used but not defined in locale files
- **locale-mismatch** — Mismatched keys across locale files

### 11. config-lint (3 rules)
Configuration validation:
- **tsconfig-validation** — Invalid or conflicting tsconfig options
- **eslint-validation** — Broken ESLint rules or plugin references
- **bundler-validation** — Vite/Webpack config issues

### 12. meta-quality (2 rules)
Scoring and quality gate:
- **scoring-weights** — Tunable penalty weights per severity
- **quality-gate** — CI fail-below threshold enforcement

## CLI Commands

### `deep-slop scan [path]`

Scan a project directory for issues.

```bash
deep-slop scan .                          # Full scan
deep-slop scan ./src                      # Scan specific directory
deep-slop scan . --json                   # JSON output
deep-slop scan . --engine ast-slop type-safety  # Run specific engines
deep-slop scan . --exclude "**/*.test.ts" # Exclude patterns
deep-slop scan . --severity warning       # Only warnings and above
deep-slop scan . --changes                # Only git-changed files
deep-slop scan . --staged                 # Only git-staged files
```

### `deep-slop fix [path]`

Auto-fix detected issues with AST-based safe transforms.

```bash
deep-slop fix .                           # Fix all fixable issues
deep-slop fix . --engine ast-slop         # Fix only one engine's issues
deep-slop fix . --safe                    # Only safe fixes
deep-slop fix . --dry-run                 # Preview without modifying files
```

### `deep-slop ci [path]`

CI mode — JSON output with quality gate.

```bash
deep-slop ci .                            # Fail below default threshold (70)
deep-slop ci . --fail-below 50            # Custom threshold
```

Exit code 1 if score is below threshold. Perfect for CI pipelines:

```yaml
- run: npx deep-slop ci . --fail-below 50
```

### `deep-slop rules`

List all available rules across all 12 engines.

```bash
deep-slop rules
```

## MCP Server

deep-slop ships an MCP (Model Context Protocol) server for integration with AI coding agents (Claude Code, Cursor, Windsurf, etc.).

### Configuration

Add to your MCP client config (e.g., `.cursor/mcp.json`, `.claude/settings.json`):

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

### MCP Tools

| Tool | Description |
|---|---|
| `deep_slop_scan` | Full project scan with configurable engines and severity |
| `deep_slop_fix` | Auto-fix issues from a specific engine |
| `deep_slop_why` | Explain why a rule flagged specific code |
| `deep_slop_engines` | List all 12 engines and their rule counts |
| `deep_slop_score` | Quick quality score check (fast, minimal output) |

## Configuration

Create `.deep-slop/config.yml` in your project root:

```yaml
# .deep-slop/config.yml

# Engine selection (all enabled by default)
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
  i18n-lint: false        # Disable for non-i18n projects
  config-lint: true
  meta-quality: true

# Quality thresholds
quality:
  maxFunctionLoc: 50      # Max lines per function
  maxFileLoc: 300         # Max lines per file
  maxNesting: 4           # Max nesting depth
  maxParams: 5            # Max function parameters
  maxCyclomatic: 10       # Max cyclomatic complexity
  maxCoupling: 10         # Max fan-in/fan-out

# Security settings
security:
  audit: true             # Run npm audit
  auditTimeout: 60        # Audit timeout in seconds
  owasp: true             # OWASP top-10 checks

# Import intelligence
imports:
  suggestAlternatives: true   # Suggest tree-shakeable paths
  optimizeBarrels: true       # Flag barrel file imports
  validateAliases: true       # Check tsconfig path aliases
  buildGraph: true            # Build import dependency graph
  maxCircularDepth: 5         # Max circular dep depth

# Type safety
types:
  flagAsAny: true              # Flag `as any` casts
  suggestTypes: true           # Suggest concrete types
  flagDoubleAssertion: true   # Flag `as unknown as X`

# Dead code
deadCode:
  unreachableBranches: true
  unusedExports: true
  unusedVariables: true

# i18n
i18n:
  hardcodedStrings: true
  validateKeys: false          # Enable if you have locale files

# Exclude patterns
exclude:
  - node_modules
  - .git
  - dist
  - build
  - coverage
  - tmp-*

# CI quality gate
ci:
  failBelow: 70            # Fail if score below this threshold
```

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

console.log(`Score: ${result.score}/100`);
console.log(`Errors: ${result.bySeverity.error}`);
console.log(`Warnings: ${result.bySeverity.warning}`);
```

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
```

## License

[MIT](LICENSE) © Romanchello 2026
