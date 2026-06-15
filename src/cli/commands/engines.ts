import { resolve } from 'node:path'
import type { Command } from 'commander'
import { ENGINE_REGISTRY } from '../../engines/orchestrator.js'
import { isEngineEnabled } from '../../config/engine-utils.js'
import { loadConfig } from '../../config/index.js'
import { style, styleBold, separator } from '../../output/theme.js'
import type { EngineName } from '../../types/index.js'

interface EngineRow {
  name: EngineName
  description: string
  languages: string[]
  active: boolean
}

export function register(program: Command): void {
  program
    .command('engines')
    .description('List all available analysis engines with languages and active status')
    .helpGroup('Explore')
    .argument('[path]', 'project directory', '.')
    .option('--json', 'Output as JSON')
    .action(async (path: string, opts: Record<string, any>) => {
      const rootDir = resolve(path)
      const config = loadConfig(rootDir)

      const entries = await Promise.all(
        Object.entries(ENGINE_REGISTRY).map(async ([name, loader]) => {
          try {
            const engine = await loader()
            const active = isEngineEnabled(config.engines[engine.name])
            return {
              name: engine.name,
              description: engine.description,
              languages: engine.supportedLanguages,
              active,
            } as EngineRow
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return {
              name: name as EngineName,
              description: `Failed to load: ${message}`,
              languages: [],
              active: false,
            } as EngineRow
          }
        }),
      )

      entries.sort((a, b) => a.name.localeCompare(b.name))

      if (opts.json) {
        console.log(JSON.stringify(entries, null, 2))
        return
      }

      const activeCount = entries.filter((e) => e.active).length
      console.log('')
      console.log(separator())
      console.log(styleBold('info', `  deep-slop engines (${entries.length} total, ${activeCount} active)`))
      console.log(separator())
      console.log('')

      const nameWidth = Math.max(...entries.map((e) => e.name.length), 4)
      const langWidth = Math.max(
        ...entries.map((e) => e.languages.join(', ').length),
        10,
      )

      for (const entry of entries) {
        const activeStr = entry.active
          ? style('success', 'active')
          : style('muted', 'inactive')
        const nameStr = style('suggestion', entry.name.padEnd(nameWidth))
        const langStr = style('muted', entry.languages.join(', ').padEnd(langWidth))
        console.log(`  ${nameStr}  ${langStr}  ${activeStr}`)
        console.log(`    ${style('muted', entry.description)}`)
      }

      console.log('')
      console.log(separator())
      console.log('')
    })
}
