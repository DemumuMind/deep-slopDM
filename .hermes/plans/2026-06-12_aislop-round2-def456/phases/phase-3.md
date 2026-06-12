# Phase 3: Trend/Score History

**Depends on:** none
**Objective:** Persist scan results over time and show score trends with sparklines

## Work

### Task 3.1: History persistence
**Files:**
- Create: `src/history/store.ts`

```typescript
// History record type
interface HistoryRecord {
  timestamp: string    // ISO 8601
  score: number
  errors: number
  warnings: number
  info: number
  suggestions: number
  filesScanned: number
  engines: string[]
  durationMs: number
}

// appendRecord(rootDir: string, record: HistoryRecord): void
//   — appends to .deep-slop/history.jsonl
//   — only for full-scope scans (not --changes/--staged/ci)

// readHistory(rootDir: string, limit?: number): HistoryRecord[]
//   — reads last N records from .deep-slop/history.jsonl
```

### Task 3.2: Sparkline rendering
**Files:**
- Create: `src/history/sparkline.ts`

```typescript
// sparkline(values: number[], width?: number): string
//   — renders Unicode block chars: ▁▂▃▄▅▆▇█
//   — Maps 0-100 score range to 8 block levels
//   — Example: "▅▇▆█▇███" for scores [65,85,70,95,85,90,95,95]

// deltaText(current: number, previous: number): string
//   — Returns colored "+5" or "-3" with up/down arrow
```

### Task 3.3: trend CLI command
**Files:**
- Modify: `src/cli.ts`

Add `deep-slop trend` command:
- `--limit <n>`: show last N runs (default 10)
- Reads history.jsonl, renders sparkline of scores
- Shows last run score with delta from previous
- Relative time labels ("2 hours ago", "3 days ago")

Output example:
```
  Score trend (last 10 runs):
  ▃▄▆▇▇█████  4 → 85 (+81)

  #  When          Score  Errors  Warns  Files
  1  2 min ago      85      0      3     47
  2  1 hour ago     82      1      5     47
  ...
```

### Task 3.4: Record scan results automatically
**Files:**
- Modify: `src/engines/orchestrator.ts`

After scan completes, if NOT a diff/staged/ci scan:
1. Build HistoryRecord from scan result
2. Call appendRecord() to persist

## Acceptance criteria
- [ ] `deep-slop scan .` appends a record to `.deep-slop/history.jsonl`
- [ ] `deep-slop trend` shows score history with sparkline
- [ ] `deep-slop trend --limit 5` shows last 5 runs
- [ ] Delta between last two runs is displayed
- [ ] Diff/staged/ci scans do NOT append to history
- [ ] `npx tsc --noEmit` = 0 errors

## Evidence commands
```bash
# Run scan (creates history record)
node dist/cli.js scan . --exclude node_modules dist
# Show trend
node dist/cli.js trend
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
