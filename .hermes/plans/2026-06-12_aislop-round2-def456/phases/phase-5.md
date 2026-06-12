# Phase 5: Hook System (Per-Agent Post-Edit Hooks)

**Depends on:** Phase 2 (rule severity overrides — quality-gate uses severity-adjusted score)
**Objective:** Install per-agent hooks that automatically run deep-slop after coding agent edits and block regressions

## Work

### Task 5.1: Hook types and installation
**Files:**
- Create: `src/hooks/types.ts`
- Create: `src/hooks/install.ts`

Hook types (per agent):
- **Claude**: `~/.claude/settings.json` → `postToolUse` hook with `deep-slop scan --staged`
- **Cursor**: `.cursor/rules/` → rule file with deep-slop check command
- **Gemini**: `.gemini/` → config with post-edit hook
- **Cline**: `.clinerules` → deep-slop quality gate rule

Install logic:
- `hook install --claude`: writes Claude Stop hook to user-level settings
- `hook install --cursor`: writes cursor rule
- `hook install --gemini`: writes gemini config
- `--global` (default): user-level install
- `--project`: project-level install (.deep-slop/hooks/)

### Task 5.2: Hook uninstall and status
**Files:**
- Create: `src/hooks/uninstall.ts`
- Create: `src/hooks/status.ts`

- `hook uninstall --claude`: removes hook from settings
- `hook status`: shows installed hooks with green/red status

### Task 5.3: Quality-gate baseline
**Files:**
- Create: `src/hooks/baseline.ts`

- `hook baseline`: captures current score as `.deep-slop/baseline.json`
- Baseline contains: score, timestamp, diagnostic counts
- Quality-gate hook compares post-edit score vs baseline
- If score drops below baseline: hook returns non-zero exit (blocks the edit in Claude Stop mode)

### Task 5.4: CLI commands
**Files:**
- Modify: `src/cli.ts`

Add `deep-slop hook` command with subcommands:
- `deep-slop hook install --claude/--cursor/--gemini` — install hooks
- `deep-slop hook uninstall --claude/--cursor/--gemini` — remove hooks
- `deep-slop hook status` — show installed hook status
- `deep-slop hook baseline` — capture score baseline
- `--quality-gate` flag on install: adds score regression blocking

## Acceptance criteria
- [ ] `deep-slop hook install --claude` writes hook to Claude settings
- [ ] `deep-slop hook status` shows which hooks are installed
- [ ] `deep-slop hook baseline` captures current score as baseline
- [ ] Quality-gate hook returns non-zero exit when score drops below baseline
- [ ] `deep-slop hook uninstall --claude` removes the hook
- [ ] `npx tsc --noEmit` = 0 errors

## Evidence commands
```bash
# Install hook
node dist/cli.js hook install --claude
# Show status
node dist/cli.js hook status
# Capture baseline
node dist/cli.js hook baseline
# Uninstall
node dist/cli.js hook uninstall --claude
# Build + test
npx tsc --noEmit && npx vitest run
```

## Mandatory commands
```bash
npx tsc --noEmit
npx vitest run
```

## Cleanliness expectations
- No debug prints
- No TODO/FIXME
- Clean override: no
