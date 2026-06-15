import { resolve, relative } from 'node:path'
import type { Command } from 'commander'
import { writeFileSync } from 'node:fs'
import { readHistory } from '../../history/store.js'
import { generateHTMLReport } from '../../output/html-report.js'
import { style } from '../../output/theme.js'

export function register(program: Command): void {
  program
    .command('report')
    .description('Generate an HTML trend report from scan history')
    .argument('[path]', 'project directory', '.')
    .option('--output <file>', 'Output HTML file path', './deep-slop-report.html')
    .option('--limit <n>', 'Number of recent scans to include', '50')
    .action(async (path: string, opts: Record<string, any>) => {
      const rootDir = resolve(path)
      const outputPath = resolve(opts.output ?? './deep-slop-report.html')
      const limit = parseInt(opts.limit ?? '50', 10)

      const records = readHistory(rootDir, limit)
      const html = generateHTMLReport(records, {
        title: `deep-slop Trend Report — ${relative(process.cwd(), rootDir) || rootDir}`,
        rootDir,
      })

      writeFileSync(outputPath, html, 'utf8')
      console.log(`  Report written to ${style('info', outputPath)}`)
      console.log('')
    })
}
