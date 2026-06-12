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

// ── Monitor Daemon ────────────────────────────────────
// Background daemon that watches for git changes and triggers auto-repair

import { resolve, join } from 'node:path'
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { runScan } from '../engines/orchestrator.js'
import { runRepairLoop, type RepairResult } from './repair.js'
import { createSession, appendSessionStep, updateSession, generateSessionId, type Session, type SessionStep } from './sessions.js'
import { detectLanguages, detectFrameworks, collectFiles } from '../utils/discover.js'
import { DEFAULT_CONFIG, type DeepSlopConfig } from '../types/index.js'

// ── Types ──────────────────────────────────────────────

export interface MonitorOptions {
  /** Root directory to monitor */
  rootDir: string
  /** Polling interval in ms (default 10000) */
  interval: number
  /** Run as detached background process */
  background: boolean
  /** Single scan cycle then exit */
  once: boolean
  /** Auto-repair when score drops below this threshold */
  targetScore: number
  /** Auto-repair on regression (score decrease) */
  repair: boolean
  /** Agent provider to use for repair */
  provider: string
  /** Max repair turns */
  maxTurns: number
}

export interface MonitorState {
  /** Unique monitor ID */
  id: string
  /** Root directory being monitored */
  rootDir: string
  /** PID of the monitor process */
  pid: number
  /** When the monitor was started */
  startedAt: string
  /** Last known score */
  lastScore: number | null
  /** Last known git HEAD hash */
  lastHeadHash: string | null
  /** Number of scan cycles completed */
  scanCycles: number
  /** Number of repairs triggered */
  repairsTriggered: number
  /** Monitor options */
  options: MonitorOptions
  /** Whether the monitor is currently running */
  status: 'running' | 'stopped' | 'error'
}

// ── Monitor Store ──────────────────────────────────────

const MONITORS_DIR = '.deep-slop/monitors'

function monitorsDir(rootDir: string): string {
  return join(rootDir, MONITORS_DIR)
}

function monitorPath(rootDir: string, id: string): string {
  return join(monitorsDir(rootDir), `${id}.json`)
}

/** Save monitor state to disk */
export function saveMonitorState(rootDir: string, state: MonitorState): void {
  const dir = monitorsDir(rootDir)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(monitorPath(rootDir, state.id), JSON.stringify(state, null, 2), 'utf8')
}

/** Read monitor state from disk */
export function readMonitorState(rootDir: string, id: string): MonitorState | null {
  const filePath = monitorPath(rootDir, id)
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as MonitorState
  } catch {
    return null
  }
}

/** List all monitors */
export function listMonitors(rootDir: string): MonitorState[] {
  const dir = monitorsDir(rootDir)
  if (!existsSync(dir)) return []

  const monitors: MonitorState[] = []
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))

  for (const file of files) {
    try {
      const state = JSON.parse(readFileSync(join(dir, file), 'utf8')) as MonitorState
      monitors.push(state)
    } catch {
      // Skip malformed files
    }
  }

  return monitors.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

/** Remove a monitor file (stop) */
export function removeMonitorState(rootDir: string, id: string): boolean {
  const filePath = monitorPath(rootDir, id)
  if (!existsSync(filePath)) return false
  rmSync(filePath)
  return true
}

// ── Git Helpers ────────────────────────────────────────

/** Get current HEAD hash */
function getHeadHash(rootDir: string): string | null {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim()
  } catch {
    return null
  }
}

// ── Scan Helper ────────────────────────────────────────

async function quickScan(rootDir: string): Promise<number> {
  const languages = await detectLanguages(rootDir)
  const frameworks = await detectFrameworks(rootDir)
  const files = await collectFiles(rootDir, languages, DEFAULT_CONFIG.exclude)
  const config: DeepSlopConfig = { ...DEFAULT_CONFIG }

  const result = await runScan({
    rootDirectory: rootDir,
    languages,
    frameworks,
    files,
    installedTools: {},
    config,
  })

  return result.score
}

// ── Monitor Loop ───────────────────────────────────────

/** Run the monitor loop (foreground) */
export async function runMonitorLoop(options: MonitorOptions): Promise<void> {
  const rootDir = resolve(options.rootDir)
  const monitorId = `mon-${randomUUID().slice(0, 8)}`
  const startTime = new Date().toISOString()

  const state: MonitorState = {
    id: monitorId,
    rootDir,
    pid: process.pid,
    startedAt: startTime,
    lastScore: null,
    lastHeadHash: getHeadHash(rootDir),
    scanCycles: 0,
    repairsTriggered: 0,
    options,
    status: 'running',
  }

  saveMonitorState(rootDir, state)

  process.stderr.write(`\n  deep-slop monitor started: ${monitorId}\n`)
  process.stderr.write(`  Root:        ${rootDir}\n`)
  process.stderr.write(`  Interval:    ${options.interval}ms\n`)
  process.stderr.write(`  Target:      ${options.targetScore}\n`)
  process.stderr.write(`  Auto-repair: ${options.repair ? 'yes' : 'no'}\n`)
  process.stderr.write(`  Provider:    ${options.provider}\n\n`)

  // Initial scan
  try {
    const score = await quickScan(rootDir)
    state.lastScore = score
    state.scanCycles++
    state.lastHeadHash = getHeadHash(rootDir)
    saveMonitorState(rootDir, state)

    process.stderr.write(`  Initial score: ${score}\n`)

    // Check if repair is needed immediately
    if (score < options.targetScore) {
      process.stderr.write(`  Score ${score} is below target ${options.targetScore}\n`)

      if (options.repair || options.once) {
        process.stderr.write(`  Triggering repair...\n`)
        await triggerRepair(rootDir, options, state)
        state.repairsTriggered++
        saveMonitorState(rootDir, state)
      }
    }

    if (options.once) {
      process.stderr.write(`  --once: exiting after first scan cycle\n`)
      state.status = 'stopped'
      saveMonitorState(rootDir, state)
      return
    }
  } catch (err) {
    process.stderr.write(`  Initial scan failed: ${err instanceof Error ? err.message : String(err)}\n`)
    state.status = 'error'
    saveMonitorState(rootDir, state)
    if (options.once) return
  }

  // Polling loop
  let running = true

  const handleSignal = () => {
    if (!running) {
      process.exit(1)
    }
    running = false
    process.stderr.write(`\n  Stopping monitor ${monitorId}...\n`)
    state.status = 'stopped'
    saveMonitorState(rootDir, state)
  }

  process.on('SIGINT', handleSignal)
  process.on('SIGTERM', handleSignal)

  while (running) {
    await new Promise<void>((resolve) => setTimeout(resolve, options.interval))

    if (!running) break

    try {
      const currentHash = getHeadHash(rootDir)

      // Check if git HEAD changed
      if (currentHash !== state.lastHeadHash) {
        process.stderr.write(`  Git change detected: ${state.lastHeadHash?.slice(0, 7) ?? 'none'} → ${currentHash?.slice(0, 7) ?? 'none'}\n`)

        state.lastHeadHash = currentHash

        // Scan after change
        const score = await quickScan(rootDir)
        state.lastScore = score
        state.scanCycles++
        saveMonitorState(rootDir, state)

        process.stderr.write(`  Score after change: ${score}\n`)

        // Check if repair needed
        const needsRepair = options.repair &&
          score < options.targetScore

        if (needsRepair) {
          process.stderr.write(`  Score ${score} below target ${options.targetScore} — triggering repair\n`)
          await triggerRepair(rootDir, options, state)
          state.repairsTriggered++

          // Re-scan after repair
          const postRepairScore = await quickScan(rootDir)
          state.lastScore = postRepairScore
          state.lastHeadHash = getHeadHash(rootDir)
          saveMonitorState(rootDir, state)

          process.stderr.write(`  Post-repair score: ${postRepairScore}\n`)
        }

        if (options.once) {
          state.status = 'stopped'
          saveMonitorState(rootDir, state)
          return
        }
      }
    } catch (err) {
      process.stderr.write(`  Monitor cycle error: ${err instanceof Error ? err.message : String(err)}\n`)
    }
  }

  state.status = 'stopped'
  saveMonitorState(rootDir, state)
}

/** Trigger a repair via the repair loop */
async function triggerRepair(
  rootDir: string,
  options: MonitorOptions,
  _monitorState: MonitorState,
): Promise<void> {
  const sessionId = generateSessionId()
  const session: Session = {
    id: sessionId,
    provider: options.provider,
    phase: 'starting',
    startTime: new Date().toISOString(),
    initialScore: _monitorState.lastScore ?? 0,
    finalScore: _monitorState.lastScore ?? 0,
    turns: 0,
    maxTurns: options.maxTurns,
    steps: [],
    files: [],
    rootDir,
    targetScore: options.targetScore,
  }

  createSession(rootDir, session)

  appendSessionStep(rootDir, sessionId, {
    type: 'scan',
    timestamp: new Date().toISOString(),
    description: `Auto-repair triggered: score ${_monitorState.lastScore} < target ${options.targetScore}`,
    score: _monitorState.lastScore ?? 0,
  })

  updateSession(rootDir, sessionId, { phase: 'running' })

  try {
    const result: RepairResult = await runRepairLoop({
      rootDir,
      provider: options.provider,
      targetScore: options.targetScore,
      maxTurns: options.maxTurns,
      inPlace: true,
      dryRun: false,
      apply: true,
      commit: true,
      pr: false,
    })

    updateSession(rootDir, sessionId, {
      phase: result.success ? 'done' : 'error',
      finalScore: result.finalScore,
      endTime: new Date().toISOString(),
      turns: result.turnsUsed,
      files: result.filesModified,
      error: result.error,
    })

    appendSessionStep(rootDir, sessionId, {
      type: 'fix',
      timestamp: new Date().toISOString(),
      description: result.success
        ? `Repair complete: ${result.initialScore} → ${result.finalScore}`
        : `Repair failed: ${result.error ?? 'did not reach target'}`,
      score: result.finalScore,
      files: result.filesModified,
    })
  } catch (err) {
    updateSession(rootDir, sessionId, {
      phase: 'error',
      endTime: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ── Background Spawn ───────────────────────────────────

/** Spawn a detached monitor process */
export function spawnBackgroundMonitor(options: MonitorOptions): string {
  const monitorId = `mon-${randomUUID().slice(0, 8)}`

  const args = [
    process.argv[1],
    'agent', 'monitor',
    options.rootDir,
    '--interval', String(options.interval),
    '--target-score', String(options.targetScore),
    '--provider', options.provider,
    '--max-turns', String(options.maxTurns),
  ]

  if (options.repair) args.push('--repair')

  const child: ChildProcess = spawn(process.execPath, args, {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      DEEP_SLOP_MONITOR_ID: monitorId,
    },
  })

  child.unref()

  // Write initial monitor state
  const state: MonitorState = {
    id: monitorId,
    rootDir: resolve(options.rootDir),
    pid: child.pid!,
    startedAt: new Date().toISOString(),
    lastScore: null,
    lastHeadHash: null,
    scanCycles: 0,
    repairsTriggered: 0,
    options,
    status: 'running',
  }

  saveMonitorState(resolve(options.rootDir), state)

  return monitorId
}

/** Stop a running monitor by PID */
export function stopMonitor(rootDir: string, monitorId: string): boolean {
  const state = readMonitorState(rootDir, monitorId)
  if (!state) return false

  try {
    if (state.pid && state.pid !== process.pid) {
      process.kill(state.pid, 'SIGTERM')
    }
  } catch {
    // Process may already be dead
  }

  state.status = 'stopped'
  saveMonitorState(rootDir, state)
  return true
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
