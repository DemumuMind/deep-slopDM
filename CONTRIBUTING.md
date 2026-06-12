# Contributing to deep-slop

Thank you for your interest in contributing! This guide covers everything you need.

## Quick Start

```bash
git clone https://github.com/cardtest15-coder/deep-slop.git
cd deep-slop
pnpm install
pnpm build
pnpm test
```

## Project Structure

```
src/
├── cli.ts              # Commander CLI
├── mcp.ts              # MCP server (7+ tools)
├── version.ts          # APP_VERSION
├── engines/            # All analysis engines
│   └── <name>/index.ts # Each engine implements Engine interface
├── types/index.ts      # Shared types + DEFAULT_CONFIG
├── scoring/            # Score calculation
├── utils/              # tree-sitter, file-cache, suppress, etc.
├── plugins/            # Plugin API
└── output/             # Terminal formatting
```

## Code Style

- TypeScript strict mode
- 2-space indentation
- Single quotes for strings
- **No semicolons** (follow existing pattern)
- `.js` extension in relative imports (Node ESM)
- Section separators: `// ── SECTION ───`

## Adding a New Engine

1. Create `src/engines/<name>/index.ts`
2. Implement the `Engine` interface from `src/types/index.ts`:
   ```typescript
   import type { Engine, EngineContext, EngineResult } from '../../types/index.js'

   export const myEngine: Engine = {
     name: 'my-engine',
     description: 'What it detects',
     supportedLanguages: ['typescript', 'javascript'],
     async run(context: EngineContext): Promise<EngineResult> {
       const diagnostics = []
       // ... analysis logic
       return { diagnostics, engine: 'my-engine', elapsed: 0 }
     },
   }
   ```
3. Add engine name to `EngineName` type in `src/types/index.ts`
4. Add lazy loader to `ENGINE_REGISTRY` in `src/engines/orchestrator.ts`
5. Add description to `rules` command in `src/cli.ts`
6. Add description to MCP tools in `src/mcp.ts`
7. Add tests: `<name>.test.ts` alongside source

## Adding a New Rule

Rules live inside engines. Each rule should:
- Have a unique name: `engine-name/rule-name`
- Specify severity: `error`, `warning`, `info`, or `suggestion`
- Include a clear message explaining the issue
- Provide a suggestion when possible
- Be calibrated: run `pnpm scan` and check the rule doesn't dominate the score

## Tree-sitter Integration

If your engine uses AST analysis:
1. Import from `../../utils/tree-sitter.js`
2. Always try tree-sitter first, fall back to regex
3. Mark AST-confirmed diagnostics with `detail.astConfirmed = true`
4. Deduplicate with regex results (prefer AST)

## Testing

```bash
pnpm test              # Run all unit tests
pnpm typecheck         # TypeScript check
pnpm scan              # Build + self-scan
```

- Place tests alongside source: `<name>.test.ts`
- Use vitest: `import { describe, it, expect } from 'vitest'`
- E2E tests go in `e2e/`

## Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-engine`
3. Make your changes
4. Run: `pnpm typecheck && pnpm test && pnpm scan`
5. Commit with descriptive message
6. Open a Pull Request

## Important

- Never publish to npm — the author handles releases
- Never modify `package.json` version without updating `src/version.ts`
- Keep the `.js` extension in all relative imports
- Do not add engines to the top-level import chain — use the lazy registry
