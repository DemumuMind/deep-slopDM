import type { Command } from 'commander'
import { runDoctor } from '../doctor.js'

export function register(program: Command): void {
  program
    .command('doctor')
    .description('Check environment for deep-slop compatibility')
    .argument('[path]', 'project directory', '.')
    .action(async (path: string) => {
      await runDoctor(path)
    })
}
