#!/usr/bin/env node
import { Command } from 'commander'
import { APP_VERSION } from '../version.js'
import { renderHomeScreen } from '../ui/home.js'
import { renderCommandReference } from '../ui/command-reference.js'
import { suggestClosest } from '../ui/suggest.js'
import { checkForUpdate, showUpdateNotification } from '../update-notifier.js'
import { style } from '../output/theme.js'

import { register as registerScan } from './commands/scan.js'
import { register as registerFix } from './commands/fix.js'
import { register as registerCi } from './commands/ci.js'
import { register as registerRules } from './commands/rules.js'
import { register as registerEngines } from './commands/engines.js'
import { register as registerInit } from './commands/init.js'
import { register as registerDoctor } from './commands/doctor.js'
import { register as registerTrend } from './commands/trend.js'
import { register as registerReport } from './commands/report.js'
import { register as registerBench } from './commands/bench.js'
import { register as registerWatch } from './commands/watch.js'
import { register as registerHook } from './commands/hook.js'
import { register as registerAgent } from './commands/agent/index.js'
import { register as registerBadge } from './commands/badge.js'
import { register as registerUpdate } from './commands/update.js'
import { register as registerConfig } from './commands/config.js'

const program = new Command()

program
  .name('deep-slop')
  .description('Deep AI slop detection — 25 engines, AST-powered, with alternative import paths')
  .version(APP_VERSION)

registerScan(program)
registerFix(program)
registerCi(program)
registerRules(program)
registerEngines(program)
registerInit(program)
registerConfig(program)
registerDoctor(program)
registerTrend(program)
registerReport(program)
registerBench(program)
registerWatch(program)
registerHook(program)
registerAgent(program)
registerBadge(program)
registerUpdate(program)

program
  .command('schema')
  .description('Output JSON Schema for .deep-slop/config.yml (for IDE autocomplete)')
  .option('--output <path>', 'Write schema to file instead of stdout')
  .action(async (opts: Record<string, any>) => {
    const { generateJsonSchema } = await import('../config/json-schema.js')
    const schema = generateJsonSchema()

    if (opts.output) {
      const { writeFileSync } = await import('node:fs')
      const { resolve: resolvePath } = await import('node:path')
      const outPath = resolvePath(opts.output)
      writeFileSync(outPath, JSON.stringify(schema, null, 2) + '\n')
      process.stderr.write(`  ✔ Schema written to ${outPath}\n`)
    } else {
      console.log(JSON.stringify(schema, null, 2))
    }
  })

program
  .command('discover')
  .description('Analyze project: languages, frameworks, package manager, linters, tests, CI')
  .argument('[path]', 'project directory', '.')
  .option('--json', 'Output as JSON')
  .action(async (path: string, opts: Record<string, any>) => {
    const { resolve } = await import('node:path')
    const rootDir = resolve(path)
    const { projectInfo } = await import('../utils/discover.js')
    const { style, styleBold, separator } = await import('../output/theme.js')

    process.stderr.write(`\n  deep-slop discover: ${rootDir}\n\n`)
    const info = await projectInfo(rootDir)

    if (opts.json) {
      console.log(JSON.stringify(info, null, 2))
      return
    }

    console.log('')
    console.log(separator())
    console.log(styleBold('info', '  Project Discovery'))
    console.log(separator())
    console.log(`  Languages:      ${info.languages.length > 0 ? info.languages.map((l) => style('info', l)).join(', ') : style('muted', 'none detected')}`)
    if (Object.keys(info.fileCounts).length > 0) {
      const countsStr = Object.entries(info.fileCounts)
        .map(([lang, count]) => `${style('suggestion', lang)}:${count}`)
        .join('  ')
      console.log(`  File counts:    ${countsStr}`)
    }
    console.log(`  Total files:    ${info.totalFiles}`)
    console.log(`  Frameworks:     ${info.frameworks.map((f) => f === 'none' ? style('muted', f) : style('info', f)).join(', ')}`)
    console.log(`  Package mgr:    ${info.packageManager ? style('info', info.packageManager) : style('muted', 'none detected')}`)
    console.log(`  Linters:        ${info.linters.length > 0 ? info.linters.map((l) => style('suggestion', l)).join(', ') : style('muted', 'none detected')}`)
    console.log(`  Test frameworks:${info.testFrameworks.length > 0 ? info.testFrameworks.map((t) => style('suggestion', t)).join(', ') : style('muted', 'none detected')}`)
    console.log(`  CI systems:     ${info.ci.length > 0 ? info.ci.map((c) => style('suggestion', c)).join(', ') : style('muted', 'none detected')}`)
    const covColor = info.coverage.isScoreable ? 'success' : 'warn'
    console.log(`  Scoreable:      ${style(covColor, info.coverage.isScoreable ? 'yes' : 'no')} (${Math.round(info.coverage.coverage * 100)}% coverage)`)
    if (info.coverage.reason) {
      console.log(`  Coverage note:  ${style('muted', info.coverage.reason)}`)
    }
    console.log(separator())
    console.log('')
  })

program
  .command('commands')
  .description('Show command reference with all available commands and flags')
  .action(() => {
    renderCommandReference()
  })

const originalParse = program.parse.bind(program)
program.parse = function (argv?: readonly string[]) {
  const args = argv ?? process.argv
  const subArgs = args.slice(2)
  const hasSubcommand = subArgs.length > 0 && !subArgs[0].startsWith('-')

  if (!hasSubcommand) {
    if (!process.stdout.isTTY) {
      renderHomeScreen()
      return program as any
    }
    import('../ui/interactive.js').then(({ interactiveMenu }) => {
      interactiveMenu().catch(() => {
        process.exit(1)
      })
    })
    return program as any
  }

  return originalParse(args)
}

program.on('command:*', (operands: string[]) => {
  const unknown = operands[0]
  const allCommands = program.commands.map((c) => c.name()).filter(Boolean)
  const suggestion = suggestClosest(unknown, allCommands)
  console.error(style('danger', `  Unknown command: ${unknown}`))
  if (suggestion) {
    console.error(style('muted', `  Did you mean '${style('suggestion', suggestion)}'?`))
  }
  console.error(style('muted', '  Run `deep-slop commands` for a full command reference.'))
  process.exit(1)
})

checkForUpdate().then((info) => {
  if (info?.isOutdated) {
    showUpdateNotification(info)
  }
}).catch(() => {
  // Silently ignore update check failures
})

program.parse()
