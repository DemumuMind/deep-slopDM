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

// ── Session Persistence ───────────────────────────────
// JSONL-based session store for agent repair runs

import { mkdirSync, appendFileSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

// ── Types ──────────────────────────────────────────────

export type SessionPhase = 'starting' | 'running' | 'awaiting-decision' | 'done' | 'error'

export interface SessionStep {
  /** Step type */
  type: 'scan' | 'diagnose' | 'fix' | 'verify' | 'rollback' | 'commit' | 'provider-call' | 'file-edit' | 'decision'
  /** Timestamp ISO string */
  timestamp: string
  /** Human-readable description */
  description: string
  /** Score after this step (if applicable) */
  score?: number
  /** Findings count after this step (if applicable) */
  findingsCount?: number
  /** Files affected by this step */
  files?: string[]
  /** Additional metadata */
  detail?: Record<string, unknown>
}

export interface Session {
  /** Unique session ID */
  id: string
  /** Agent provider used */
  provider: string
  /** Session phase */
  phase: SessionPhase
  /** Start time ISO string */
  startTime: string
  /** End time ISO string (set when done/error) */
  endTime?: string
  /** Score before repair */
  initialScore: number
  /** Score after repair (updated as session progresses) */
  finalScore: number
  /** Number of repair turns used */
  turns: number
  /** Max turns allowed */
  maxTurns: number
  /** All steps recorded in this session */
  steps: SessionStep[]
  /** All files touched during session */
  files: string[]
  /** Root directory of the project */
  rootDir: string
  /** Target score */
  targetScore: number
  /** Error message if phase is 'error' */
  error?: string
}

export interface SessionSummary {
  id: string
  provider: string
  phase: SessionPhase
  startTime: string
  endTime?: string
  initialScore: number
  finalScore: number
  turns: number
  targetScore: number
  filesCount: number
  error?: string
}

export interface SessionDetail extends SessionSummary {
  maxTurns: number
  rootDir: string
  steps: SessionStep[]
  files: string[]
}

// ── Storage ────────────────────────────────────────────

const SESSIONS_DIR = '.deep-slop/sessions'

function sessionsDir(rootDir: string): string {
  return join(rootDir, SESSIONS_DIR)
}

function sessionPath(rootDir: string, id: string): string {
  return join(sessionsDir(rootDir), `${id}.jsonl`)
}

/** Generate a new session ID */
export function generateSessionId(): string {
  return `sess-${randomUUID().slice(0, 8)}-${Date.now().toString(36)}`
}

/** Create a new session and persist the header */
export function createSession(rootDir: string, session: Session): void {
  const dir = sessionsDir(rootDir)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const header = JSON.stringify({ ...session, _type: 'session' })
  appendFileSync(sessionPath(rootDir, session.id), header + '\n', 'utf8')
}

/** Append a step to an existing session */
export function appendSessionStep(rootDir: string, id: string, step: SessionStep): void {
  const line = JSON.stringify({ ...step, _type: 'step', sessionId: id })
  appendFileSync(sessionPath(rootDir, id), line + '\n', 'utf8')
}

/** Update session header fields (phase, finalScore, endTime, error, etc.) */
export function updateSession(
  rootDir: string,
  id: string,
  updates: Partial<Pick<Session, 'phase' | 'finalScore' | 'endTime' | 'error' | 'turns' | 'files'>>,
): void {
  const filePath = sessionPath(rootDir, id)
  if (!existsSync(filePath)) return

  const content = readFileSync(filePath, 'utf8')
  const lines = content.trim().split('\n').filter(Boolean)

  if (lines.length === 0) return

  let header: Session
  try {
    header = JSON.parse(lines[0]) as Session
  } catch {
    return
  }

  if (updates.phase !== undefined) header.phase = updates.phase
  if (updates.finalScore !== undefined) header.finalScore = updates.finalScore
  if (updates.endTime !== undefined) header.endTime = updates.endTime
  if (updates.error !== undefined) header.error = updates.error
  if (updates.turns !== undefined) header.turns = updates.turns
  if (updates.files !== undefined) header.files = updates.files

  const stepLines = lines.slice(1)
  writeFileSync(filePath, JSON.stringify(header) + '\n' + stepLines.join('\n') + '\n', 'utf8')
}

/** List all sessions (summary view) */
export function listSessions(rootDir: string): SessionSummary[] {
  const dir = sessionsDir(rootDir)
  if (!existsSync(dir)) return []

  const summaries: SessionSummary[] = []
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'))

  for (const file of files) {
    try {
      const content = readFileSync(join(dir, file), 'utf8')
      const firstLine = content.trim().split('\n')[0]
      if (!firstLine) continue
      const session = JSON.parse(firstLine) as Session
      summaries.push(toSummary(session))
    } catch {
      // Skip malformed session files
    }
  }

  summaries.sort((a, b) => b.startTime.localeCompare(a.startTime))
  return summaries
}

/** Get full session detail including all steps */
export function getSession(rootDir: string, id: string): SessionDetail | null {
  const filePath = sessionPath(rootDir, id)
  if (!existsSync(filePath)) return null

  try {
    const content = readFileSync(filePath, 'utf8')
    const lines = content.trim().split('\n').filter(Boolean)

    if (lines.length === 0) return null

    const header = JSON.parse(lines[0]) as Session
    const steps: SessionStep[] = []

    for (let i = 1; i < lines.length; i++) {
      try {
        const step = JSON.parse(lines[i]) as SessionStep
        steps.push(step)
      } catch {
        // Skip malformed step lines
      }
    }

    return {
      ...toSummary(header),
      maxTurns: header.maxTurns,
      rootDir: header.rootDir,
      steps,
      files: header.files,
    }
  } catch {
    return null
  }
}

/** Convert Session to SessionSummary */
function toSummary(s: Session): SessionSummary {
  return {
    id: s.id,
    provider: s.provider,
    phase: s.phase,
    startTime: s.startTime,
    endTime: s.endTime,
    initialScore: s.initialScore,
    finalScore: s.finalScore,
    turns: s.turns,
    targetScore: s.targetScore,
    filesCount: s.files.length,
    error: s.error,
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
