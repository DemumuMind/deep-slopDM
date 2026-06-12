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

// ── Real-time engine progress grid on stderr ────────────
// Spinner animation with braille dots, row states, outcomes.
// Auto-fallback to plain text when not TTY.

import { style, styleBold } from '../output/theme.js'
import type { EngineName, EngineResult } from '../types/index.js'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const SPINNER_INTERVAL = 100

type RowState = 'queued' | 'running' | 'done' | 'skipped'
type RowOutcome = 'ok' | 'warn' | 'fail'

interface GridRow {
  name: EngineName
  state: RowState
  outcome?: RowOutcome
  issueCount: number
  elapsed: number
  skipReason?: string
}

function stateIcon(row: GridRow, frame: number): string {
  switch (row.state) {
    case 'queued':
      return style('muted', '·')
    case 'running':
      return style('info', SPINNER_FRAMES[frame % SPINNER_FRAMES.length]!)
    case 'done':
      switch (row.outcome) {
        case 'ok': return style('success', '✓')
        case 'warn': return style('warn', '⚠')
        case 'fail': return style('danger', '✗')
        default: return style('success', '✓')
      }
    case 'skipped':
      return style('muted', '⏭')
  }
}

function elapsedStr(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export class LiveGrid {
  private rows: GridRow[] = []
  private frame = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private isTty: boolean
  private started = false

  constructor(
    private engineNames: EngineName[],
    private stream: NodeJS.WriteStream = process.stderr as NodeJS.WriteStream,
  ) {
    this.isTty = stream.isTTY ?? false
    this.rows = engineNames.map((name) => ({
      name,
      state: 'queued',
      issueCount: 0,
      elapsed: 0,
    }))
  }

  /** Start the animation loop */
  start(): void {
    if (this.started) return
    this.started = true

    if (this.isTty) {
      this.render()
      this.timer = setInterval(() => {
        this.frame++
        this.render()
      }, SPINNER_INTERVAL)
    } else {
      // Plain text fallback: just print header
      this.stream.write(`\n  ${styleBold('info', 'Engines:')}\n`)
    }
  }

  /** Mark an engine as running */
  setRunning(name: EngineName): void {
    const row = this.rows.find((r) => r.name === name)
    if (!row) return
    row.state = 'running'
    if (!this.isTty) {
      this.stream.write(`  ${SPINNER_FRAMES[0]} ${name}...`)
    }
  }

  /** Mark an engine as complete */
  setComplete(name: EngineName, result: EngineResult): void {
    const row = this.rows.find((r) => r.name === name)
    if (!row) return

    row.elapsed = result.elapsed
    row.skipReason = result.skipReason

    if (result.skipped) {
      row.state = 'skipped'
      if (!this.isTty) {
        this.stream.write(` ⏭ skipped\n`)
      }
    } else {
      row.state = 'done'
      row.issueCount = result.diagnostics.length

      // Determine outcome
      const errors = result.diagnostics.filter((d) => d.severity === 'error').length
      if (errors > 0) {
        row.outcome = 'fail'
      } else if (result.diagnostics.length > 0) {
        row.outcome = 'warn'
      } else {
        row.outcome = 'ok'
      }

      if (!this.isTty) {
        const status = row.outcome === 'ok' ? '✓' : row.outcome === 'fail' ? '✗' : '⚠'
        this.stream.write(` ${status} ${result.diagnostics.length} issues (${Math.round(result.elapsed)}ms)\n`)
      }
    }
  }

  /** Stop animation and render final state */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.isTty && this.started) {
      this.render()
      // Move cursor below the grid
      this.stream.write('\n')
    }
  }

  /** Render the full grid */
  private render(): void {
    if (!this.isTty) return

    // Build grid lines
    const lines: string[] = []
    for (const row of this.rows) {
      const icon = stateIcon(row, this.frame)
      const name = row.name.padEnd(22)
      let detail = ''
      if (row.state === 'done') {
        const count = row.issueCount > 0 ? `${row.issueCount} issues` : 'clean'
        detail = `${count}  ${style('muted', elapsedStr(row.elapsed))}`
      } else if (row.state === 'running') {
        detail = style('muted', 'running...')
      } else if (row.state === 'skipped') {
        detail = style('muted', row.skipReason ?? 'skipped')
      } else {
        detail = style('muted', 'queued')
      }
      lines.push(`  ${icon} ${name} ${detail}`)
    }

    // Calculate how many lines to move up
    const rowCount = this.rows.length
    const headerHeight = 1

    // Clear and redraw
    if (this.frame > 0) {
      this.stream.write(`\x1b[${rowCount + headerHeight}A\x1b[0J`)
    }

    // Header
    const progress = this.rows.filter((r) => r.state === 'done' || r.state === 'skipped').length
    const total = this.rows.length
    this.stream.write(`  ${styleBold('info', 'Engines')} ${style('muted', `${progress}/${total}`)}\n`)

    // Rows
    for (const line of lines) {
      this.stream.write(`${line}\n`)
    }
  }
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
