# Phase 1: Diff-Aware Scanning

**Depends on:** none
**Objective:** Add --changes/--staged/--base git diff flags so deep-slop can scan only changed files instead of everything

## Work

### Task 1.1: Git diff utilities
**Files:**
- Create: `src/utils/git-diff.ts`

```typescript
// Functions:
// getChangedFiles(baseRef?: string): Promise<string[]>  — git diff --name-only vs HEAD or base
// getStagedFiles(): Promise<string[]>  — git diff --cached --name-only
// baseRefExists(ref: string): Promise<boolean>  — git rev-parse --verify <ref>
// isGitRepo(rootDir: string): Promise<boolean>  — git rev-parse --is-inside-work-tree
// getCurrentBranch(): Promise<string>  — git branch --show-current
```

Use `execSync('git ...')` with error catching. Return empty array on failure (not git repo, etc).

### Task 1.2: CLI flags
**Files:**
- Modify: `src/cli.ts`

Add flags to scan command:
- `--changes`: only scan files changed vs HEAD (calls getChangedFiles())
- `--staged`: only scan staged files (calls getStagedFiles())
- `--base <ref>`: diff against arbitrary ref (e.g. `origin/main`)

When any diff flag is set:
1. Get the list of changed/staged files
2. Filter context.files to only include those files
3. Print scope line: "N changed vs <ref> file(s)"
4. Run scan on filtered file list only

Also add these flags to the `ci` command.

### Task 1.3: Diff scope in output
**Files:**
- Modify: `src/output/formatter.ts`
- Modify: `src/output/sarif.ts`

Show diff scope in both human and SARIF output:
- Human: "12 changed vs origin/main file(s)" in header
- SARIF: `invocations[0].automationDetails.correlationId` = diff base ref

## Acceptance criteria
- [ ] `deep-slop scan . --changes --exclude node_modules dist` only scans files with uncommitted changes
- [ ] `deep-slop scan . --staged` only scans staged files
- [ ] `deep-slop scan . --base origin/main --exclude node_modules dist` only scans files that differ from origin/main
- [ ] Scope line appears in output showing "N changed vs <ref> file(s)"
- [ ] If not a git repo, --changes/--staged/--base print warning and fall back to full scan
- [ ] `npx tsc --noEmit` = 0 errors
- [ ] `npx vitest run` = all pass

## Evidence commands
```bash
# Diff-aware scan
node dist/cli.js scan . --changes --exclude node_modules dist
# Staged only
node dist/cli.js scan . --staged --exclude node_modules dist
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
