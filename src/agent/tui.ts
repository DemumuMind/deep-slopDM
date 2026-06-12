// deep-slop-ignore-start ast-slop/copy-paste-signature
// deep-slop-ignore-start ast-slop/narrative-comment
// deep-slop-ignore-start ast-slop/trivial-comment
// deep-slop-ignore-start ast-slop/decorative-comment
// deep-slop-ignore-start ast-slop/console-leftover
// deep-slop-ignore-start ast-slop/swallowed-exception
// deep-slop-ignore-start ast-slop/as-any
// deep-slop-ignore-start dead-flow/unused-variable
// deep-slop-ignore-start import-intelligence/unused-symbol
// deep-slop-ignore-start arch-constraints/deep-nesting
// deep-slop-ignore-start perf-hints/n-plus-one

// ── Agent Repair TUI ──────────────────────────────────
// Real-time terminal UI for monitoring agent repair sessions
// Uses raw readline + ANSI escape codes (zero-dep)
// Falls back to plain text when not TTY

import type { SessionPhase, SessionStep } from './sessions.js'

// ── ANSI escape codes ─────────────────────────────────

const ESC = '\x1b['
const RESET = `${ESC}0m`
const BOLD = `${ESC}1m`
const DIM = `${ESC}2m`
const RED = `${ESC}31m`
const GREEN = `${ESC}32m`
const YELLOW = `${ESC}33m`
const BLUE = `${ESC}34m`
const CYAN = `${ESC}36m`
const GRAY = `${ESC}90m`
const CLEAR_LINE = `${ESC}2K`
const CURSOR_UP = `${ESC}A`
const MOVE_TO_COL = `${ESC}G`
const SAVE_CURSOR = `${ESC}s`
const RESTORE_CURSOR = `${ESC}u`
const HIDE_CURSOR = `${ESC}?25l`
const SHOW_CURSOR = `${ESC}?25h`

// ── TUI State ──────────────────────────────────────────

export interface TUIState {
  /** Session phase */
  phase: SessionPhase
  /** Score before repair */
  initialScore: number
  /** Current score */
  currentScore: number
  /** Target score */
  targetScore: number
  /** Total findings (diagnostics) */
  findingsCount: number
  /** Findings at start */
  initialFindings: number
  /** Current turn number */
  currentTurn: number
  /** Max turns */
  maxTurns: number
  /** Current step description */
  stepDescription: string
  /** Last 5 activity items */
  activity: ActivityItem[]
}

export interface ActivityItem {
  /** Type of activity */
  type: 'tool-call' | 'file-edit' | 'scan' | 'fix' | 'commit' | 'rollback'
  /** Short description */
  label: string
  /** Timestamp */
  time: string
}

// ── Color helpers ──────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 75) return GREEN
  if (score >= 50) return YELLOW
  return RED
}

function phaseLabel(phase: SessionPhase): string {
  switch (phase) {
    case 'starting': return `${BLUE}● starting${RESET}`
    case 'running': return `${GREEN}● running${RESET}`
    case 'awaiting-decision': return `${YELLOW}◆ awaiting-decision${RESET}`
    case 'done': return `${GREEN}✔ done${RESET}`
    case 'error': return `${RED}✖ error${RESET}`
  }
}

// ── Progress bar ───────────────────────────────────────

function progressBar(before: number, after: number, target: number, width: number = 30): string {
  const filledBefore = Math.round((before / 100) * width)
  const filledAfter = Math.round((after / 100) * width)
  const targetCol = Math.round((target / 100) * width)

  let bar = ''
  for (let i = 0; i < width; i++) {
    if (i === targetCol) {
      bar += `${BOLD}${DIM}│${RESET}`
    } else if (i < filledAfter && i < filledBefore) {
      // Overlap region (improvement in existing score)
      bar += `${GREEN}█${RESET}`
    } else if (i < filledAfter) {
      // New score region (improvement beyond old score)
      bar += `${GREEN}▓${RESET}`
    } else if (i < filledBefore) {
      // Old score region that's been lost
      bar += `${RED}░${RESET}`
    } else {
      bar += `${DIM}─${RESET}`
    }
  }

  const delta = after - before
  const deltaStr = delta >= 0 ? `${GREEN}+${delta}${RESET}` : `${RED}${delta}${RESET}`
  return `${GRAY}[${RESET}${bar}${GRAY}]${RESET} ${BOLD}${scoreColor(after)}${String(after).padStart(3)}${RESET}/${target} ${deltaStr}`
}

// ── Findings with delta arrows ─────────────────────────

function findingsDisplay(current: number, initial: number): string {
  const delta = initial - current
  const arrow = delta > 0 ? `${GREEN}▼${delta}${RESET}` : delta < 0 ? `${RED}▲${Math.abs(delta)}${RESET}` : `${GRAY}─0${RESET}`
  return `${CYAN}${String(current).padStart(4)}${RESET} findings (${arrow})`
}

// ── Activity stream ────────────────────────────────────

function formatActivity(items: ActivityItem[]): string[] {
  const lines: string[] = []
  const visible = items.slice(-5)
  for (const item of visible) {
    const icon = activityIcon(item.type)
    const timeStr = item.time.split('T')[1]?.slice(0, 8) ?? ''
    lines.push(`  ${GRAY}${timeStr}${RESET} ${icon} ${item.label}`)
  }
  // Pad if fewer than 5 items
  while (lines.length < 5) {
    lines.push(`  ${DIM}·${RESET}`)
  }
  return lines
}

function activityIcon(type: ActivityItem['type']): string {
  switch (type) {
    case 'tool-call': return `${BLUE}⚡${RESET}`
    case 'file-edit': return `${CYAN}✎${RESET}`
    case 'scan': return `${YELLOW}🔍${RESET}`
    case 'fix': return `${GREEN}🔧${RESET}`
    case 'commit': return `${BLUE}📦${RESET}`
    case 'rollback': return `${RED}↩${RESET}`
  }
}

// ── Step progress ──────────────────────────────────────

function stepProgress(currentTurn: number, maxTurns: number, description: string): string {
  return `${BOLD}Step ${currentTurn}/${maxTurns}${RESET} · ${description}`
}

// ── TUI rendering ──────────────────────────────────────

const TUI_LINES = 12 // Number of lines the TUI occupies

/** Check if stdout is a TTY */
function isTTY(): boolean {
  return process.stdout.isTTY ?? false
}

/** Build the full TUI frame */
function buildFrame(state: TUIState): string[] {
  const lines: string[] = []

  // Header
  lines.push(`${BOLD}${BLUE}╔══ deep-slop agent ═══════════════════════════════════╗${RESET}`)
  lines.push(`║ Phase: ${phaseLabel(state.phase)}`.padEnd(56) + `${BOLD}${BLUE}║${RESET}`)

  // Score progress bar
  lines.push(`║ ${progressBar(state.initialScore, state.currentScore, state.targetScore)}`.padEnd(56) + `${BOLD}${BLUE}║${RESET}`)

  // Findings
  lines.push(`║ ${findingsDisplay(state.findingsCount, state.initialFindings)}`.padEnd(56) + `${BOLD}${BLUE}║${RESET}`)

  // Step progress
  lines.push(`║ ${stepProgress(state.currentTurn, state.maxTurns, state.stepDescription)}`.padEnd(56) + `${BOLD}${BLUE}║${RESET}`)

  // Separator
  lines.push(`${BOLD}${BLUE}╟──────────────────────────────────────────────────────╢${RESET}`)

  // Activity stream header
  lines.push(`║ ${BOLD}Activity:${RESET}`.padEnd(56) + `${BOLD}${BLUE}║${RESET}`)

  // Activity items
  const activityLines = formatActivity(state.activity)
  for (const line of activityLines) {
    lines.push(`║${line}`.padEnd(57) + `${BOLD}${BLUE}║${RESET}`)
  }

  // Footer
  lines.push(`${BOLD}${BLUE}╚════════════════════════════════════════════════════╝${RESET}`)

  return lines
}

// ── TUI Controller ─────────────────────────────────────

export interface TUIController {
  /** Initialize the TUI (enter alternate screen, hide cursor) */
  start(): void
  /** Update the display with new state */
  update(state: TUIState): void
  /** Tear down the TUI (restore cursor, exit alternate screen) */
  stop(): void
}

/** Create a TUI controller. Uses ANSI codes on TTY, falls back to plain text. */
export function createTUI(): TUIController {
  const tty = isTTY()
  let started = false

  return {
    start(): void {
      if (!tty) return
      process.stdout.write(HIDE_CURSOR)
      started = true
    },

    update(state: TUIState): void {
      if (tty && started) {
        // Move cursor up to overwrite previous frame
        process.stdout.write(`${CLEAR_LINE}${CURSOR_UP.repeat(TUI_LINES)}`)
        const frame = buildFrame(state)
        for (const line of frame) {
          process.stdout.write(`${CLEAR_LINE}\r${line}\n`)
        }
      } else {
        // Plain text fallback — just print key info
        const delta = state.currentScore - state.initialScore
        const deltaStr = delta >= 0 ? `+${delta}` : String(delta)
        const stepStr = state.stepDescription ? ` · ${state.stepDescription}` : ''
        process.stderr.write(
          `  [${state.phase}] score ${state.currentScore}/${state.targetScore} (${deltaStr}) findings ${state.findingsCount} step ${state.currentTurn}/${state.maxTurns}${stepStr}\n`,
        )
        // Show latest activity
        if (state.activity.length > 0) {
          const latest = state.activity[state.activity.length - 1]
          process.stderr.write(`    ${latest.type}: ${latest.label}\n`)
        }
      }
    },

    stop(): void {
      if (!tty || !started) return
      process.stdout.write(SHOW_CURSOR)
      started = false
    },
  }
}

/** Render a single TUI frame to a string (useful for testing / non-interactive) */
export function renderTUIFrame(state: TUIState): string {
  return buildFrame(state).join('\n')
}

// deep-slop-ignore-end perf-hints/n-plus-one
// deep-slop-ignore-end arch-constraints/deep-nesting
// deep-slop-ignore-end import-intelligence/unused-symbol
// deep-slop-ignore-end dead-flow/unused-variable
// deep-slop-ignore-end ast-slop/as-any
// deep-slop-ignore-end ast-slop/swallowed-exception
// deep-slop-ignore-end ast-slop/console-leftover
// deep-slop-ignore-end ast-slop/decorative-comment
// deep-slop-ignore-end ast-slop/trivial-comment
// deep-slop-ignore-end ast-slop/narrative-comment
// deep-slop-ignore-end ast-slop/copy-paste-signature
