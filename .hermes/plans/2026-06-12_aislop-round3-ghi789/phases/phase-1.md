# Phase 1: Interactive TUI + Live Grid Progress

**Depends on:** none
**Objective:** Add interactive fuzzy-search action menu when user runs `deep-slop` with no args in TTY, plus live engine progress grid with spinner during scan

## Work

### Task 1.1: searchSelect fuzzy-search prompt
**Files:**
- Create: `src/ui/search-select.ts`

Zero-dependency fuzzy search prompt built on raw readline:
- `searchSelect<T>(items: T[], options: { label: (item: T) => string, filter: (item: T, query: string) => boolean }): Promise<T | null>`
- Type-to-filter with ranked results, arrow up/down navigation, enter confirm, escape cancel
- Falls back to first item if no query

### Task 1.2: Interactive action menu
**Files:**
- Create: `src/ui/interactive.ts`

When `deep-slop` runs with no args in TTY:
- Actions: Scan, Fix, Agent Repair, Doctor, Init, Rules, Hook Install, Hook Status, Trend, Watch, Quit
- After action completes, show "Next action?" loop
- If not TTY or prompt cancelled: fall back to `deep-slop scan .`

### Task 1.3: Live grid progress rendering
**Files:**
- Create: `src/ui/live-grid.ts`

Real-time engine progress on stderr:
- Spinner animation: braille dots ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ (10 frames, 100ms)
- Row states: queued, running, done, skipped
- Row outcomes: ok, warn, fail
- Renders full grid: engine name, status icon, elapsed ms
- Auto-fallback to plain text when not TTY

### Task 1.4: Wire into CLI and orchestrator
**Files:**
- Modify: `src/cli.ts` — no-args handler launches interactive menu
- Modify: `src/engines/orchestrator.ts` — use LiveGrid for engine-by-engine progress instead of stderr lines

## Acceptance criteria
- [ ] Running `deep-slop` with no args in TTY shows interactive action menu
- [ ] Fuzzy search filters actions by typing
- [ ] Arrow keys navigate, enter selects, escape cancels
- [ ] Non-TTY falls back to `deep-slop scan .`
- [ ] Scan shows live engine progress grid with spinner
- [ ] `npx tsc --noEmit` = 0 errors

## Evidence commands
```bash
# Non-TTY fallback still works
echo "" | node dist/cli.js 2>&1 | head -3
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
