# Phase 4: Watch Mode + File Monitor

**Depends on:** Phase 1 (diff-aware scanning — needed for change detection)
**Objective:** Add `deep-slop watch` command that monitors file changes and re-scans automatically

## Work

### Task 4.1: File watcher utility
**Files:**
- Create: `src/watch/watcher.ts`

```typescript
// Uses Node.js fs.watch() with chokidar-like debouncing
// watchDirectory(rootDir: string, options: WatchOptions): Watcher
//
// WatchOptions:
//   interval: number (ms between checks, default 3000)
//   debounce: number (ms to wait after last change, default 2000)
//   exclude: string[] (patterns to skip)
//   onChange: (changedFiles: string[]) => void
//   onStats: (stats: WatchStats) => void
//
// Watcher:
//   start(): void
//   stop(): void
//   getStats(): WatchStats
```

Use `fs.watch` with recursive flag on Linux/WSL, with debounce: collect changes within debounce window, then call onChange with the list.

### Task 4.2: Watch CLI command
**Files:**
- Modify: `src/cli.ts`

Add `deep-slop watch [directory]` command:
- `--interval <ms>`: polling interval (default 3000)
- `--debounce <ms>`: debounce window (default 2000)
- `--repair`: auto-fix on change (runs fix pipeline in safe mode)
- `--once`: single scan cycle then exit
- `--background`: spawn detached daemon process

Behavior:
1. Start watcher on directory
2. On file change: run diff-aware scan on changed files only
3. Print results with score
4. If --repair and score < 75: run fix pipeline in safe mode
5. If --once: exit after first scan

### Task 4.3: Monitor status display
**Files:**
- Create: `src/watch/display.ts`

Show real-time status:
- File change count since last scan
- Last scan score with delta
- Current status: "watching..." / "scanning..." / "fixing..."
- Elapsed time since last scan

## Acceptance criteria
- [ ] `deep-slop watch .` starts monitoring and re-scans on file change
- [ ] `deep-slop watch . --once` scans changed files once and exits
- [ ] `deep-slop watch . --repair` auto-fixes when score drops below threshold
- [ ] `--interval` and `--debounce` flags control polling frequency
- [ ] Ctrl+C gracefully stops the watcher
- [ ] `npx tsc --noEmit` = 0 errors

## Evidence commands
```bash
# Single-cycle watch
node dist/cli.js watch . --once --exclude node_modules dist
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
