# Phase 5: Fix Pipeline

**Depends on:** Phase 1 (scoring — to measure improvement)
**Objective:** Implement a safe auto-fix pipeline: plan → steps → apply → verify

## Work

### Task 5.1: Fix pipeline core
**Files:**
- Create: `src/fix/plan.ts` — Generate fix plan from diagnostics
- Create: `src/fix/steps.ts` — Convert plan to concrete file edit steps
- Create: `src/fix/apply.ts` — Apply steps to files (with backup)
- Create: `src/fix/verify.ts` — Re-scan to confirm improvement
- Create: `src/fix/types.ts` — FixPlan, FixStep, FixResult types

Pipeline:
1. **Plan**: Group fixable diagnostics by file, order by line (bottom-up to preserve offsets)
2. **Steps**: For each diagnostic with `suggestion`, generate text replacement steps
3. **Apply**: Write changes to files, create `.deep-slop/fix-backup/` with originals
4. **Verify**: Re-run scan, compare score. If worse → rollback from backup

### Task 5.2: Safe vs Force modes
**Files:**
- Modify: `src/cli.ts` (fix command flags)

- `--safe` (default): Only apply fixes with confidence >= 0.8, skip uncertain ones
- `--force`: Apply all fixable diagnostics regardless of confidence
- `--dry-run`: Show what would be fixed, no file modifications
- `--verify`: Re-scan after fix and report score delta

### Task 5.3: Engine fix implementations
**Files:**
- Modify: `src/engines/ast-slop/index.ts` — Add `fix()` method
- Modify: `src/engines/dead-flow/index.ts` — Add `fix()` method

Initial fix-capable rules:
- ast-slop/trivial-comment → remove comment line
- ast-slop/console-leftover → remove console.log line
- dead-flow/unused-import → remove import line
- dead-flow/empty-block → add `// intentionally empty` comment

## Acceptance criteria
- [ ] `deep-slop fix . --dry-run` shows planned fixes without modifying files
- [ ] `deep-slop fix . --safe` only applies high-confidence fixes
- [ ] `deep-slop fix . --force` applies all fixable diagnostics
- [ ] Fix creates backup in `.deep-slop/fix-backup/`
- [ ] If fix worsens score, changes are rolled back
- [ ] `--verify` flag reports score before/after
- [ ] `npx tsc` compiles cleanly

## Evidence commands
```bash
# Dry run
node dist/cli.js fix . --dry-run --exclude node_modules dist

# Build
npx tsc
npx vitest run
```

## Mandatory commands
```bash
npx tsc
npx vitest run
```

## Cleanliness expectations
- No debug prints
- No TODO/FIXME
- Clean override: no
