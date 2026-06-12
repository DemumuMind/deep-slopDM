# AGENTS.md — Instructions for AI Coding Agents

This file provides guidance for AI coding agents (Claude Code, Cursor, Windsurf, Copilot, etc.) working on the **deep-slop** project.

## Project Overview

**deep-slop** is an npm package for deep AI slop detection in codebases. It ships 12 specialized analysis engines using tree-sitter AST parsing, with CLI and MCP server interfaces.

- **Package name**: `deep-slop`
- **Author**: Romanchello
- **License**: MIT
- **Repo**: https://github.com/Romanchello/deep-slop

## Architecture

```
src/
├── cli.ts                    # Commander CLI (scan, fix, ci, rules)
├── mcp.ts                    # MCP server (5 tools for AI agent integration)
├── index.ts                  # Public API exports
├── engines/
│   ├── orchestrator.ts       # Engine registry + parallel execution + scoring
│   ├── ast-slop/             # AI slop pattern detection (10 rules)
│   ├── import-intelligence/  # Import optimization (7 rules)
│   ├── dead-flow/            # Dead code analysis (7 rules)
│   ├── type-safety/          # TypeScript type safety (6 rules)
│   ├── syntax-deep/          # Syntax anomalies (12 rules)
│   ├── security-deep/        # Security vulnerabilities (7 rules)
│   ├── arch-constraints/     # Architecture analysis (3 rules)
│   ├── dup-detect/           # Duplicate code (2 rules)
│   ├── perf-hints/           # Performance hints (4 rules)
│   ├── i18n-lint/            # Internationalization (3 rules)
│   ├── config-lint/          # Config validation (3 rules)
│   └── meta-quality/         # Scoring/quality gate (2 rules)
├── types/
│   └── index.ts              # All shared types + DEFAULT_CONFIG
├── output/
│   └── formatter.ts          # Terminal output formatting
├── utils/
│   ├── discover.ts           # Language/framework detection + file collection
│   └── file-utils.ts         # File reading utilities
└── config/                   # Config loading (reserved)
    └── mcp/                  # MCP helpers (reserved)
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

4. **Scoring**: Weighted penalty system — errors: 10, warnings: 3, info: 1, suggestions: 0.5. Score = `max(0, round(100 - totalPenalty))`.

5. **ESM only**: The project uses `"type": "module"`. All imports use `.js` extension (Node ESM convention).

6. **Build**: Uses `tsdown` (not tsup/rollup). Entry points: `cli.ts`, `mcp.ts`, `index.ts`. Output goes to `dist/`.

## Commands

```bash
pnpm install          # Install deps (uses pnpm 10)
pnpm build            # Build to dist/
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest run
pnpm scan             # Build + scan the project itself
```

## When Adding a New Engine

1. Create `src/engines/<engine-name>/index.ts`
2. Implement the `Engine` interface
3. Export the engine instance (e.g., `export const myEngine: Engine = { ... }`)
4. Add the engine name to `EngineName` type in `src/types/index.ts`
5. Add the lazy loader to `ENGINE_REGISTRY` in `src/engines/orchestrator.ts`
6. Add the engine description to the `rules` command in `src/cli.ts`
7. Add the engine description to the `deep_slop_engines` tool in `src/mcp.ts`
8. Update DEFAULT_CONFIG if the engine needs config options

## When Modifying Types

All shared types live in `src/types/index.ts`. This is the single source of truth for:
- `EngineName`, `Severity`, `Language`, `Framework`, `Category`
- `Diagnostic`, `Suggestion`, `EngineResult`, `EngineContext`
- `Engine`, `FixResult`, `DeepSlopConfig`, `ScanResult`
- `DEFAULT_CONFIG`

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
- Change the scoring formula without updating both orchestrator.ts and the README
- Remove the `.js` extension from relative imports (required for ESM)
- Publish to npm or create GitHub repos — the author handles that manually
- Modify `package.json` version without updating it in `cli.ts` and `mcp.ts` too
