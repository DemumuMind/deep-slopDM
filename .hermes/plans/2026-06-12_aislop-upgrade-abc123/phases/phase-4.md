# Phase 4: CLI Polish — init + doctor Commands

**Depends on:** Phase 3 (Zod config — init scaffolds valid config)
**Objective:** Add `deep-slop init` and `deep-slop doctor` commands for first-run experience and toolchain checking

## Work

### Task 4.1: `deep-slop init` command
**Files:**
- Modify: `src/cli.ts` (add init subcommand)

Behavior:
1. Create `.deep-slop/` directory
2. Write `config.yml` with sensible defaults (from Zod schema defaults)
3. Create `.github/workflows/deep-slop.yml` CI workflow
4. Add `.deep-slop/` to `.gitignore` if not present
5. `--strict` flag: set all thresholds to strict values, enable all engines

### Task 4.2: `deep-slop doctor` command
**Files:**
- Modify: `src/cli.ts` (add doctor subcommand)

Check:
1. Node.js version (>=18)
2. TypeScript installed (tsc --version)
3. Config file exists and is valid (Zod parse)
4. Each enabled engine can load (lazy import test)
5. Tree-sitter WASM available
6. Project has package.json
7. ESLint/Prettier configured
8. Git hooks present
9. Score: X/N checks passed

### Task 4.3: Version consistency
**Files:**
- Create: `src/version.ts`
- Modify: `src/cli.ts`, `src/mcp.ts`

Single source of truth for version constant. Both CLI and MCP read from same place.

## Acceptance criteria
- [ ] `deep-slop init` creates `.deep-slop/config.yml` with valid config
- [ ] `deep-slop init --strict` creates config with strict thresholds
- [ ] `deep-slop init` creates `.github/workflows/deep-slop.yml`
- [ ] `deep-slop doctor` checks 8+ toolchain items
- [ ] `deep-slop doctor` reports pass/fail per check with actionable messages
- [ ] Version string is consistent between CLI --version and MCP server
- [ ] `npx tsc` compiles cleanly

## Evidence commands
```bash
# Init works
cd /tmp && mkdir test-init && cd test-init && git init && node /mnt/c/Users/Romanchello/source/repo/Coder/AI_Debugger_Slop/dist/cli.js init . && cat .deep-slop/config.yml

# Doctor works
node dist/cli.js doctor .

# Build
npx tsc
```

## Mandatory commands
```bash
npx tsc
npx vitest run
node dist/cli.js init /tmp/test-deep-slop-init
node dist/cli.js doctor .
```

## Cleanliness expectations
- No debug prints
- No TODO/FIXME
- Clean override: no
