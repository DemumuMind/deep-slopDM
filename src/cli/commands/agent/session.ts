import { resolve } from 'node:path'
import type { Command } from 'commander'
import { listSessions, getSession, updateSession } from '../../../agent/sessions.js'
import { style, styleBold, separator } from '../../../output/theme.js'

export function registerSessions(agentCmd: Command): void {
  agentCmd
    .command('sessions')
    .description('List all agent repair sessions')
    .argument('[directory]', 'project directory', '.')
    .action((directory: string) => {
      const rootDir = resolve(directory)
      const sessions = listSessions(rootDir)

      console.log('')
      console.log(separator())
      console.log(styleBold('info', '  Agent Sessions'))
      console.log(separator())

      if (sessions.length === 0) {
        console.log(style('muted', '  No sessions found'))
      } else {
        console.log(`  ${style('muted', 'ID'.padEnd(20))} ${style('muted', 'Phase'.padEnd(18))} ${style('muted', 'Score'.padEnd(12))} ${style('muted', 'Turns')}  ${style('muted', 'Provider')}`)
        for (const s of sessions) {
          const phaseStr = s.phase === 'done' ? style('success', s.phase)
            : s.phase === 'error' ? style('danger', s.phase)
            : s.phase === 'running' ? style('info', s.phase)
            : s.phase === 'awaiting-decision' ? style('warn', s.phase)
            : style('muted', s.phase)
          const scoreDelta = s.finalScore - s.initialScore
          const scoreStr = `${s.initialScore}→${s.finalScore}${scoreDelta >= 0 ? style('success', `+${scoreDelta}`) : style('danger', String(scoreDelta))}`
          console.log(`  ${style('suggestion', s.id.padEnd(20))} ${phaseStr.padEnd(18 + 20)} ${scoreStr.padEnd(12 + 20)} ${String(s.turns).padEnd(6)} ${style('info', s.provider)}`)
        }
      }

      console.log(separator())
      console.log('')
    })
}

export function registerSessionShow(agentCmd: Command): void {
  agentCmd
    .command('show')
    .description('Show details for a specific agent session')
    .argument('<id>', 'Session ID')
    .argument('[directory]', 'project directory', '.')
    .action((id: string, directory: string) => {
      const rootDir = resolve(directory)
      const detail = getSession(rootDir, id)

      if (!detail) {
        console.log(style('danger', `  Session not found: ${id}`))
        process.exit(1)
      }

      console.log('')
      console.log(separator())
      console.log(styleBold('info', `  Session: ${detail.id}`))
      console.log(separator())
      console.log(`  Provider:     ${style('info', detail.provider)}`)
      console.log(`  Phase:        ${detail.phase === 'done' ? style('success', detail.phase) : detail.phase === 'error' ? style('danger', detail.phase) : style('info', detail.phase)}`)
      console.log(`  Started:      ${detail.startTime}`)
      if (detail.endTime) console.log(`  Ended:        ${detail.endTime}`)
      const delta = detail.finalScore - detail.initialScore
      const deltaStr = delta >= 0 ? style('success', `+${delta}`) : style('danger', String(delta))
      console.log(`  Score:        ${detail.initialScore} → ${detail.finalScore} (${deltaStr})`)
      console.log(`  Target:       ${detail.targetScore}`)
      console.log(`  Turns:        ${detail.turns}/${detail.maxTurns}`)
      console.log(`  Files:        ${detail.filesCount} modified`)
      if (detail.error) console.log(`  Error:        ${style('danger', detail.error)}`)

      if (detail.steps.length > 0) {
        console.log('')
        console.log(style('muted', '  Steps:'))
        for (const step of detail.steps) {
          const icon = step.type === 'scan' ? '🔍'
            : step.type === 'fix' ? '🔧'
            : step.type === 'rollback' ? '↩'
            : step.type === 'commit' ? '📦'
            : step.type === 'verify' ? '✓'
            : step.type === 'provider-call' ? '⚡'
            : step.type === 'file-edit' ? '✎'
            : '·'
          const timeStr = step.timestamp.split('T')[1]?.slice(0, 8) ?? ''
          const scoreStr = step.score !== undefined ? ` score=${step.score}` : ''
          console.log(`    ${icon} ${style('muted', timeStr)} ${step.description}${style('muted', scoreStr)}`)
        }
      }

      if (detail.files.length > 0) {
        console.log('')
        console.log(style('muted', '  Modified files:'))
        for (const f of detail.files) {
          console.log(`    ${style('suggestion', f)}`)
        }
      }

      console.log(separator())
      console.log('')
    })
}

export function registerSessionStop(agentCmd: Command): void {
  agentCmd
    .command('stop')
    .description('Stop a running agent session (sets phase to error)')
    .argument('<id>', 'Session ID')
    .argument('[directory]', 'project directory', '.')
    .action((id: string, directory: string) => {
      const rootDir = resolve(directory)
      const detail = getSession(rootDir, id)

      if (!detail) {
        console.log(style('danger', `  Session not found: ${id}`))
        process.exit(1)
      }

      if (detail.phase !== 'running' && detail.phase !== 'starting') {
        console.log(style('warn', `  Session ${id} is not running (phase: ${detail.phase})`))
        return
      }

      updateSession(rootDir, id, {
        phase: 'error',
        endTime: new Date().toISOString(),
        error: 'Stopped by user',
      })

      console.log('')
      console.log(style('success', `  Session ${id} stopped`))
      console.log('')
    })
}
