import { resolve } from 'node:path'
import type { Command } from 'commander'
import { readHistory } from '../../history/store.js'
import { sparkline, deltaText } from '../../history/sparkline.js'
import { relativeTime } from '../../history/relative-time.js'
import { style, styleBold } from '../../output/theme.js'

export function register(program: Command): void {
  program
    .command('trend')
    .description('Show score trend across recent scans')
    .argument('[path]', 'project directory', '.')
    .option('--limit <n>', 'Show last N runs', '10')
    .action(async (path: string, opts: Record<string, any>) => {
      const rootDir = resolve(path)
      const limit = parseInt(opts.limit ?? '10', 10)
      const records = readHistory(rootDir, limit)

      if (records.length === 0) {
        console.log(style('muted', 'No scan history found. Run `deep-slop scan` first.'))
        return
      }

      const scores = records.map((r) => r.score ?? 0)
      const latest = records[records.length - 1]
      const latestScore = latest.score ?? 0
      const previous = records.length >= 2 ? records[records.length - 2].score : null
      const delta = deltaText(latestScore, previous)

      console.log('')
      console.log(styleBold('info', `Score trend (last ${records.length} runs):`))
      console.log(`  ${sparkline(scores)}  ${styleBold(latestScore >= 75 ? 'success' : latestScore >= 50 ? 'warn' : 'danger', String(latestScore))} (${delta})`)
      console.log('')
      console.log(`  ${style('muted', '#')}  ${style('muted', 'When').padEnd(14)} ${style('muted', 'Score').padEnd(7)} ${style('muted', 'Errors').padEnd(7)} ${style('muted', 'Warns').padEnd(7)} ${style('muted', 'Files')}`)

      const reversed = [...records].reverse()
      for (let i = 0; i < reversed.length; i++) {
        const r = reversed[i]
        const num = String(i + 1).padEnd(3)
        const when = relativeTime(r.timestamp).padEnd(14)
        const scoreStr = String(r.score).padEnd(7)
        const errs = String(r.errors).padEnd(7)
        const warns = String(r.warnings).padEnd(7)
        const files = String(r.filesScanned)
        console.log(`  ${num}${when}${scoreStr}${errs}${warns}${files}`)
      }

      console.log('')
    })
}
