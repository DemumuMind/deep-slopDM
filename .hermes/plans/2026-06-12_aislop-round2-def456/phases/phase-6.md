# Phase 6: Agent Repair Loop

**Depends on:** Phase 5 (hook system — uses quality-gate for convergence)
**Objective:** Full agent repair loop with git worktree isolation, provider abstraction, and verify-apply workflow

## Work

### Task 6.1: Git worktree management
**Files:**
- Create: `src/agent/worktree.ts`

```typescript
// createWorktree(rootDir: string): Promise<{ worktreeDir: string, branch: string }>
//   — git worktree add <temp-branch> at ../.deep-slop-worktree-<id>
// applyWorktreeDiff(worktreeDir: string, rootDir: string): Promise<void>
//   — git diff worktree → apply patch to main tree
// cleanupWorktree(worktreeDir: string): Promise<void>
//   — git worktree remove
```

### Task 6.2: Provider abstraction
**Files:**
- Modify: `src/agents/providers.ts`

Extend existing providers with:
- `detectAll()`: auto-detect which providers are installed
- `runProvider(provider, prompt, options)`: spawn provider process, stream output, return result
- Options: { maxTurns, targetDir, background }

### Task 6.3: Repair loop core
**Files:**
- Create: `src/agent/repair.ts`

```typescript
// runRepairLoop(options: RepairOptions): Promise<RepairResult>
//
// RepairOptions:
//   rootDir: string
//   provider: string (claude/codex/aider/etc)
//   targetScore: number (stop when score >= this)
//   maxTurns: number (max repair cycles)
//   inPlace: boolean (edit current tree vs worktree)
//   dryRun: boolean (preview only)
//
// Repair loop:
// 1. Run scan → get score
// 2. If score >= targetScore: done, success
// 3. Format diagnostics as prompt for provider
// 4. Run provider in target directory
// 5. Re-scan → check if score improved
// 6. If score worsened: rollback (git checkout)
// 7. If score improved but not at target: loop back to step 3
// 8. If maxTurns reached: report partial improvement
```

### Task 6.4: Agent CLI command
**Files:**
- Modify: `src/cli.ts`

Add `deep-slop agent` command with subcommands:
- `deep-slop agent repair` — run repair loop
  - `--provider <name>`: which provider to use
  - `--target-score <n>`: target score (default 75)
  - `--max-turns <n>`: max cycles (default 5)
  - `--in-place`: edit current tree (no worktree isolation)
  - `--dry-run`: preview only
  - `--apply`: auto-apply fixes without confirmation
  - `--commit`: auto-commit after each improvement
  - `--pr`: create draft PR at end
- `deep-slop agent providers` — show installed providers
- `deep-slop agent plan` — preview repair plan without running

## Acceptance criteria
- [ ] `deep-slop agent repair --provider claude --target-score 75` runs repair loop
- [ ] Repair loop: scan → prompt → fix → verify → repeat until score >= target
- [ ] If score worsens after provider edits, changes are rolled back
- [ ] `--dry-run` shows repair plan without modifying files
- [ ] `deep-slop agent providers` shows installed agent providers
- [ ] `npx tsc --noEmit` = 0 errors

## Evidence commands
```bash
# Provider check
node dist/cli.js agent providers
# Dry run repair
node dist/cli.js agent repair --provider aider --dry-run --target-score 50
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
