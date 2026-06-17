import { resolve } from 'node:path'
import type { Command } from 'commander'
import { detectAllProviders } from '../../../agents/providers.js'
import { connectProvider, resolveProvider } from '../../../agent/connect.js'
import { setProviderPreference } from '../../../agent/use.js'
import { style, styleBold, separator } from '../../../output/theme.js'
import {
  registerRepair,
  registerPlan,
  registerApply,
  monitorStartAction,
  monitorListAction,
  monitorShowAction,
  monitorStopAction,
} from './repair.js'
import { registerSessions, registerSessionShow, registerSessionStop } from './session.js'

export function register(program: Command): void {
  const agentCmd = program
    .command('agent')
    .description('AI agent-powered repair commands')

  registerRepair(agentCmd)
  registerPlan(agentCmd)
  registerConnect(agentCmd)
  registerUse(agentCmd)
  registerProviders(agentCmd)
  registerMonitor(agentCmd)
  registerSessions(agentCmd)
  registerSessionShow(agentCmd)
  registerApply(agentCmd)
  registerSessionStop(agentCmd)
}

function registerConnect(agentCmd: Command): void {
  agentCmd
    .command('connect')
    .description('Connect and verify an AI agent provider')
    .argument('<provider>', 'Provider name (claude/codex/aider/cursor/opencode/goose)')
    .argument('[path]', 'project directory', '.')
    .action(async (provider: string, path: string) => {
      const rootDir = resolve(path)

      console.log('')
      console.log(separator())
      console.log(styleBold('info', `  Connecting to ${provider}...`))
      console.log(separator())

      const result = await connectProvider(provider, rootDir)

      if (result.success) {
        console.log(`  ${style('success', '✔')} ${result.message}`)
        console.log(`  ${style('muted', 'Provider preference saved to .deep-slop/provider')}`)
      } else {
        console.log(`  ${style('danger', '✖')} ${result.message}`)
      }

      console.log(separator())
      console.log('')

      if (!result.success) {
        process.exit(1)
      }
    })
}

function registerUse(agentCmd: Command): void {
  agentCmd
    .command('use')
    .description('Set default AI agent provider for this project')
    .argument('<provider>', 'Provider name (claude/codex/aider/cursor/opencode/goose/auto)')
    .argument('[path]', 'project directory', '.')
    .action(async (provider: string, path: string) => {
      const rootDir = resolve(path)

      console.log('')
      console.log(separator())
      console.log(styleBold('info', `  Setting default provider: ${provider}`))
      console.log(separator())

      try {
        if (provider === 'auto') {
          const resolved = await resolveProvider('auto', rootDir)
          setProviderPreference(resolved, rootDir)
          console.log(`  ${style('success', '✔')} Auto-detected: ${style('info', resolved)}`)
          console.log(`  ${style('muted', 'Saved to .deep-slop/provider')}`)
        } else {
          setProviderPreference(provider, rootDir)
          console.log(`  ${style('success', '✔')} Default provider set to ${style('info', provider)}`)
          console.log(`  ${style('muted', 'Saved to .deep-slop/provider')}`)
        }
      } catch (err) {
        console.log(`  ${style('danger', '✖')} ${err instanceof Error ? err.message : String(err)}`)
        console.log(separator())
        console.log('')
        process.exit(1)
      }

      console.log(separator())
      console.log('')
    })
}

function registerProviders(agentCmd: Command): void {
  agentCmd
    .command('providers')
    .description('Show installed AI agent providers and their availability')
    .action(async () => {
      const providers = await detectAllProviders()

      console.log('')
      console.log(separator())
      console.log(styleBold('info', '  AI Agent Providers'))
      console.log(separator())

      for (const p of providers) {
        const icon = p.available ? style('success', '✔') : style('muted', '✖')
        const status = p.available ? style('success', 'available') : style('muted', 'not installed')
        console.log(`  ${icon} ${style('info', p.name.padEnd(10))} ${status}`)
      }

      console.log(separator())
      console.log('')
    })
}

function registerMonitor(agentCmd: Command): void {
  const monitorCmd = agentCmd
    .command('monitor')
    .description('Watch for git changes and auto-repair when score drops below target')

  monitorCmd
    .command('start', { isDefault: true })
    .description('Start monitoring a directory for changes')
    .argument('[directory]', 'project directory', '.')
    .option('--background', 'Spawn detached process and return immediately')
    .option('--once', 'Single scan cycle then exit')
    .option('--target-score <n>', 'Auto-repair when score drops below', '75')
    .option('--repair', 'Auto-repair on regression')
    .option('--interval <ms>', 'Polling interval in ms', '10000')
    .option('--provider <name>', 'Agent provider to use (claude/codex/cursor/opencode/aider/goose/windsurf/vscode/amp/gemini-cli/kimi/warp/pi/crush/deep-agents/antigravity)', 'claude')
    .option('--max-turns <n>', 'Max repair turns', '5')
    .action(monitorStartAction)

  monitorCmd
    .command('list')
    .description('List all monitors')
    .argument('[directory]', 'project directory', '.')
    .action(monitorListAction)

  monitorCmd
    .command('show')
    .description('Show details for a specific monitor')
    .argument('<id>', 'Monitor ID')
    .argument('[directory]', 'project directory', '.')
    .action(monitorShowAction)

  monitorCmd
    .command('stop')
    .description('Stop a running monitor')
    .argument('<id>', 'Monitor ID')
    .argument('[directory]', 'project directory', '.')
    .action(monitorStopAction)
}
