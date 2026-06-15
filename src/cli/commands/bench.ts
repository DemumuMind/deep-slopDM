import { resolve } from 'node:path'
import type { Command } from 'commander'
import { runBenchmark, formatJsonSummary } from '../../bench/index.js'

export function register(program: Command): void {
  program
    .command('bench')
    .description('Benchmark scan performance across engines')
    .argument('[path]', 'project directory', '.')
    .option('--iterations <n>', 'Number of scan iterations', '3')
    .option('--compare', 'Compare with the previous benchmark result')
    .option('--json', 'Output as JSON')
    .action(async (path: string, opts: Record<string, any>) => {
      const rootDir = resolve(path)
      const iterations = parseInt(opts.iterations ?? '3', 10)
      const compare = opts.compare ?? false
      const json = opts.json ?? false

      process.stderr.write(`\n  deep-slop bench: ${rootDir} (${iterations} iterations)\n\n`)

      const { result, summary, previous } = await runBenchmark({
        path: rootDir,
        iterations,
        compare,
      })

      if (json) {
        console.log(formatJsonSummary(result, previous))
      } else {
        console.log(summary)
        console.log('')
      }
    })
}
