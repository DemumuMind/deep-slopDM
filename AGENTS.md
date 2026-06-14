# AGENTS.md — Instructions for AI Coding Agents

This file provides guidance for AI coding agents (Claude Code, Cursor, Windsurf, Copilot, etc.) working on the **deep-slop** project.

## Project Overview

**deep-slop** is an npm package for deep AI slop detection in codebases. It ships 18 built-in analysis engines using tree-sitter AST parsing, plus a plugin system for custom engines, with CLI, MCP server, and programmatic API interfaces.

- **Package name**: `deep-slop`
- **Author**: Romanchello
- **License**: MIT
- **Repo**: https://github.com/DemumuMind/deep-slopDM
- **Engines**: 18 built-in (lazy-loaded) + plugin engines
- **Rules**: 181+ catalog rules across all engines (36 fixable)

## Architecture

```
src/
├── cli.ts                    # Commander CLI (scan, fix, ci, rules, init, doctor, trend, watch, hook, agent, badge, update)
├── cli/                      # Per-command CLI helpers (init, doctor)
├── mcp.ts                    # MCP server (7+ tools for AI agent integration)
├── index.ts                  # Public API exports
├── agent/                    # Agent integration (connect, repair loop, use, plan)
├── agents/                   # Provider pricing and capabilities
├── badge/                    # shields.io badge generation
├── config/                   # Config loading, defaults, presets, Zod schema, JSON schema
├── engines/                  # Analysis engines
│   ├── orchestrator.ts       # Engine registry + parallel execution + scoring
│   ├── ast-slop/             # AI slop pattern detection
│   ├── import-intelligence/  # Import optimization
│   ├── dead-flow/            # Dead code analysis
│   ├── type-safety/          # TypeScript type safety
│   ├── syntax-deep/          # Syntax anomalies
│   ├── security-deep/        # Security vulnerabilities
│   ├── arch-constraints/     # Architecture analysis
│   ├── dup-detect/           # Duplicate code
│   ├── perf-hints/           # Performance hints
│   ├── i18n-lint/            # Internationalization
│   ├── config-lint/          # Config validation
│   ├── meta-quality/         # Scoring/quality gate
│   ├── arch-rules/           # User-defined rules from .deep-slop/rules.yml
│   ├── lint-external/        # External linter integration (ruff, golangci-lint, clippy)
│   ├── knip/                 # Unused dependency/export detection
│   ├── format-lint/          # Formatting consistency
│   ├── framework-lint/       # Framework-specific rules (Next.js, Tailwind)
│   └── markup-lint/          # Markup & config quality (JSON, YAML, CSS, HTML, Markdown)
├── fix/                      # Auto-fix pipeline: plan, apply, verify, rollback
├── history/                  # Score history tracking and sparklines
├── hooks/                    # Git hooks and AI tool hooks (install, audit, sentinel, baseline)
├── output/                   # Terminal output, SARIF, formatter, rule labels, theme
├── plugins/                  # Plugin discovery and loader
├── scoring/                  # Density-aware scoring, impact tiers, rule overrides/severity
├── security/                 # Dependency audit and HTML safety helpers
├── telemetry/                # Usage telemetry
├── types/                    # All shared types + DEFAULT_CONFIG
├── ui/                       # Interactive UI (prompts, live grid, home screen, suggestions)
├── utils/                    # Language/framework detection, file collection, git diff, file cache
└── watch/                    # Watch mode for file changes
```

## Key Design Decisions

1. **Lazy engine loading**: Engines are loaded via dynamic `import()` in the orchestrator registry. Never import engines eagerly at the top level.

2. **All engines async**: Every engine's `run()` method returns `Promise<EngineResult>`. The orchestrator runs them in parallel via `Promise.allSettled()`.

3. **Engine interface**: Every engine must implement the `Engine` interface from `src/types/index.ts`:
   - `name: EngineName`
   - `description: string`
   - `supportedLanguages: Language[]`
   - `run(context: EngineContext): Promise<EngineResult>`
   - `fix?(diagnostics, context): Promise<FixResult>` (optional)

4. **Scoring**: Density-aware logarithmic scoring with impact tiers and per-rule caps. Default weights are error=10, warning=3, info=1, suggestion=0.25. Score is computed in `src/scoring/index.ts`.

5. **Fix pipeline**: `src/fix/index.ts` orchestrates **plan → apply → verify → rollback**. If verification fails, changes are rolled back automatically.

6. **Plugin system**: Custom engines are discovered from `.deep-slop/plugins/` and loaded after built-in engines via `src/plugins/registry.ts`.

7. **SARIF output**: `src/output/sarif.ts` generates SARIF 2.1.0 logs for GitHub Code Scanning.

8. **History tracking**: `src/history/store.ts` persists scan records to `.deep-slop/history.jsonl` for `trend` and sparklines.

9. **Git hooks**: `src/hooks/` manages pre-commit hooks, baseline capture, dependency audits, and sentinel mode.

10. **Badge generation**: `src/badge/index.ts` generates shields.io badge URLs for README quality badges.

11. **ESM only**: The project uses `"type": "module"`. All imports use `.js` extension (Node ESM convention).

12. **Build**: Uses `tsdown` (not tsup/rollup). Entry points: `cli.ts`, `mcp.ts`, `index.ts`. Output goes to `dist/`.

## Commands

```bash
pnpm install          # Install deps (uses pnpm 10)
pnpm build            # Build to dist/
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest run (unit + e2e)
pnpm scan             # Build + scan the project itself
```

## When Adding a New Engine

1. Create `src/engines/<engine-name>/index.ts`
2. Implement the `Engine` interface
3. Export the engine instance (e.g., `export const myEngine: Engine = { ... }`)
4. Add the engine name to `EngineName` type in `src/types/index.ts`
5. Add the lazy loader to `ENGINE_REGISTRY` in `src/engines/orchestrator.ts`
6. Add rule IDs and impact metadata to `RULE_IMPACT` in `src/scoring/rule-impact.ts`
7. Add rule display labels to `labels` in `src/output/rule-labels.ts`
8. For fixable rules, add rule IDs to `FIXABLE_RULES` in `src/engines/catalog.ts`
9. Add the engine description to the `rules` command in `src/cli.ts`
10. Add the engine description to the `deep_slop_engines` tool in `src/mcp.ts`
11. Update `DEFAULT_CONFIG` / presets in `src/config/defaults.ts` and `src/config/presets.ts` if the engine needs config options
12. Add tests in `src/engines/<engine-name>/index.test.ts`

## When Adding a New Rule

1. Add the rule to the appropriate engine in `src/engines/<engine>/index.ts`
2. Add rule impact classification in `src/scoring/rule-impact.ts`
3. Add display label in `src/output/rule-labels.ts`
4. If fixable, add to `FIXABLE_RULES` in `src/engines/catalog.ts`
5. Add tests in `src/engines/<engine>/index.test.ts`

## When Modifying Types

All shared types live in `src/types/index.ts`. This is the single source of truth for:
- `EngineName`, `Severity`, `Language`, `Framework`, `Category`
- `Diagnostic`, `Suggestion`, `EngineResult`, `EngineContext`
- `Engine`, `FixResult`, `DeepSlopConfig`, `ScanResult`

Changes to types must be reflected in:
1. The types file itself
2. `src/index.ts` (re-exports)
3. Any engine that consumes the changed type

## Code Style

- TypeScript strict mode
- 2-space indentation
- Single quotes for strings
- No semicolons (follow existing pattern in the codebase)
- Comments: use `//` for inline, `/** */` for JSDoc on exports
- Section separators: use `// ── SECTION ───` style (matching existing pattern)

## Testing

Tests use Vitest. Place test files alongside source as `<name>.test.ts`.

## Important: Do NOT

- Add engines to the top-level import chain — use the lazy registry
- Change the scoring formula without updating both `orchestrator.ts` and the `README.md`
- Remove the `.js` extension from relative imports (required for ESM)
- Publish to npm or create GitHub repos — the author handles that manually
- Modify `package.json` version without updating it in `cli.ts` and `mcp.ts` too
