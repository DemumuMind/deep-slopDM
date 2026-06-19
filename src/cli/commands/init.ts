import type { Command } from 'commander'
import { runInit } from '../init.js'

export function register(program: Command): void {
  program
    .command('init')
    .description('Initialize deep-slop configuration in a project')
    .argument('[path]', 'project directory', '.')
    .option('--strict', 'Use strict thresholds (maxFunctionLoc:30, maxFileLoc:500, maxCoupling:15, failBelow:75)')
    .option('--preset <name>', 'Use a named preset (typescript-strict, monorepo-relaxed, python-go, minimal)')
    .action((path: string, opts: { strict?: boolean, preset?: string }) => {
      runInit(path, opts)
    })
}
