# Phase 6: Agent TUI + Monitor Daemon

**Depends on:** none (independent — builds on existing watch/agent modules)
**Objective:** Add real-time terminal UI for monitoring agent repair sessions, plus background monitor daemon that watches git changes and auto-triggers repair

## Work

### Task 6.1: Agent TUI display
**Files:**
- Create: `src/agent/tui.ts`

Real-time TUI for monitoring agent repair sessions:
- Session phase display: starting, running, awaiting-decision, done, error
- Provider info + model name
- Score progress bar with before/after
- Findings count with delta arrows
- Activity stream: last 5 tool calls / file edits
- Step progress: "Step 3/5 · fixing ast-slop issues"
- Token usage display (if available from provider output)
- Pending decision prompt (yes/no choices)

Uses raw readline + ANSI escape codes (zero-dep like aislop).
Falls back to plain text when not TTY.

### Task 6.2: Agent monitor daemon
**Files:**
- Create: `src/agent/monitor.ts`

Background daemon that continuously monitors for changes:
- `deep-slop agent monitor [directory]`:
  - Watches for git changes (file additions, modifications)
  - On change: run scan → check score → if below target → trigger repair
  - `--background`: spawn detached process, return immediately
  - `--once`: single scan cycle then exit
  - `--target-score <n>`: auto-repair when score drops below
  - `--repair`: auto-repair on any regression
  - `--interval <ms>`: git polling interval (default 10000)
- Monitor store: `.deep-slop/monitors/{id}.json` with cycle history
- Subcommands:
  - `agent monitor list` — show running monitors
  - `agent monitor show <id>` — show monitor details
  - `agent monitor stop <id>` — stop monitor

### Task 6.3: Agent session management
**Files:**
- Create: `src/agent/sessions.ts`

Session persistence for repair loops:
- Session store: `.deep-slop/sessions/{id}.jsonl`
- Each session tracks: provider, start/end time, initial/final score, turns, steps, files modified
- `deep-slop agent sessions` — list local sessions
- `deep-slop agent show <id>` — show session timeline + summary
- `deep-slop agent apply <id>` — apply a reviewed session's changes (from worktree)
- `deep-slop agent stop <id>` — stop a running background session

### Task 6.4: Wire into CLI
**Files:**
- Modify: `src/cli.ts` — add agent subcommands:
  - `agent monitor [directory]` with --background/--once/--target-score/--repair/--interval
  - `agent monitor list/show/stop`
  - `agent sessions` / `agent show <id>` / `agent apply <id>` / `agent stop <id>`

## Acceptance criteria
- [ ] `deep-slop agent monitor . --once` runs single scan cycle and exits
- [ ] `deep-slop agent monitor . --background` starts detached daemon
- [ ] `deep-slop agent monitor list` shows running monitors
- [ ] `deep-slop agent monitor stop <id>` stops a monitor
- [ ] Agent TUI shows real-time repair progress with score bar
- [ ] Sessions are persisted to `.deep-slop/sessions/`
- [ ] `deep-slop agent sessions` lists past sessions
- [ ] `npx tsc --noEmit` = 0 errors

## Evidence commands
```bash
# Single-cycle monitor
node dist/cli.js agent monitor . --once --exclude node_modules dist
# Sessions list
node dist/cli.js agent sessions
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
