# Contributing to deep-slop

Thank you for your interest in contributing! This guide covers everything you need.

## Quick Start

```bash
git clone https://github.com/DemumuMind/deep-slopDM.git
cd deep-slopDM
pnpm install
pnpm build
pnpm test
```

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install dependencies |
| `pnpm build` | Build to dist/ |
| `pnpm typecheck` | tsc --noEmit |
| `pnpm test` | vitest run |
| `pnpm scan` | Build + scan the project itself |

## Architecture

```
src/
├── cli.ts                    # Commander CLI (12 commands)
├── mcp.ts                    # MCP server (7+ tools)
├── index.ts                  # Public API exports
├── engines/                  # 22 analysis engines
│   ├── orchestrator.ts       # Engine registry + parallel execution
│   ├── ast-slop/             # AI slop detection (20+ rules)
│   ├── import-intelligence/  # Import optimization (10+ rules) ★ flagship
│   ├── dead-flow/            # Dead code analysis (7+ rules)
│   ├── type-safety/          # TypeScript type safety (6 rules)
│   ├── syntax-deep/          # Syntax anomalies (12 rules)
│   ├── security-deep/        # Security vulnerabilities (7 rules)
│   ├── arch-constraints/     # Architecture analysis (3+ rules)
│   ├── dup-detect/           # Duplicate code (2 rules)
│   ├── perf-hints/           # Performance hints (4 rules)
│   ├── i18n-lint/            # Internationalization (3 rules)
│   ├── config-lint/          # Config validation (3 rules)
│   ├── meta-quality/         # Scoring/quality gate (2 rules)
│   ├── knip/                 # Knip integration
│   ├── arch-rules/           # Custom architecture rules
│   ├── lint-external/        # External linter integration
│   ├── format-lint/          # Formatting consistency (6 rules)
│   ├── framework-lint/       # Next.js (8) + Tailwind (7) rules
│   └── markup-lint/          # JSON/YAML/CSS/HTML/Markdown (20 rules)
├── types/index.ts            # All shared types + DEFAULT_CONFIG
├── output/                   # Terminal output + SARIF formatter
├── scoring/                  # Weighted scoring system
├── utils/                    # tree-sitter, discover, suppress, etc.
├── agent/                    # Agent repair + skills
├── hooks/                    # Sentinel, dep-audit, feedback
├── fix/                      # Auto-fix pipeline
├── plugins/                  # Plugin loader + registry
├── security/                 # Security audit + secrets
└── config/                   # Config loading + JSON schema + presets
```

## When Adding a New Engine

1. Create `src/engines/<engine-name>/index.ts`
2. Implement the `Engine` interface from `src/types/index.ts`:
   ```typescript
   export const myEngine: Engine = {
     name: 'my-engine',
     description: 'Description of what it detects',
     supportedLanguages: ['typescript', 'javascript'],
     async run(context: EngineContext): Promise<EngineResult> { ... }
   }
   ```
3. Add engine name to `EngineName` type in `src/types/index.ts`
4. Add lazy loader to `ENGINE_REGISTRY` in `src/engines/orchestrator.ts`
5. Add to `ENGINE_MODULES` in `src/cli/doctor.ts`
6. Add to `EngineNameSchema` in `src/config/schema.ts`
7. Add description to CLI rules command in `src/cli/commands/rules.ts`
8. Add to MCP tools description in `src/mcp.ts`
9. Add rule impact tiers in `src/scoring/rule-impact.ts`
10. Add rule labels in `src/output/rule-labels.ts`

## When Adding a New Rule

1. Add detection logic to the appropriate engine
2. Choose severity: error, warning, info, or suggestion
3. Add fix suggestion if applicable
4. Add rule impact tier in `src/scoring/rule-impact.ts`
5. Add display label in `src/output/rule-labels.ts`
6. Add to the engine's rule list in CLI and MCP descriptions

## Code Style

- TypeScript strict mode
- 2-space indentation
- Single quotes for strings
- No semicolons (follow existing pattern)
- Comments: `//` for inline, `/** */` for JSDoc on exports
- Section separators: `// ── SECTION ───`
- All relative imports use `.js` extension (Node ESM)

## Testing

Tests use Vitest. Place test files alongside source as `<name>.test.ts`.

```bash
pnpm test              # Run all tests
pnpm test -- --watch   # Watch mode
```

## Important: Do NOT

- Add engines to the top-level import chain — use the lazy registry
- Change the scoring formula without updating both orchestrator.ts and README
- Remove the `.js` extension from relative imports (required for ESM)
- Modify `package.json` version without updating version.ts too
- Use `read_file` from hermes_tools and pass output to `write_file` — line numbers corrupt files

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-engine`)
3. Add tests for new functionality
4. Ensure `pnpm typecheck` and `pnpm test` pass
5. Submit PR with description of changes
