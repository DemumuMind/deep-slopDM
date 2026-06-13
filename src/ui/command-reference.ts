// ── Command Reference ──────────────────────────────────
// Formatted table of all commands

import { style, styleBold, separator } from '../output/theme.js'

export interface CommandEntry {
  name: string
  description: string
  flags: string[]
}

export const COMMANDS: CommandEntry[] = [
  {
    name: 'scan',
    description: 'Scan project for AI slop and quality issues',
    flags: ['--json', '--sarif', '--format', '--changes', '--staged', '--base', '--include', '--exclude', '--engine', '--rule', '--severity'],
  },
  {
    name: 'fix',
    description: 'Auto-fix detected issues',
    flags: ['--engine', '--safe', '--force', '--dry-run', '--verify'],
  },
  {
    name: 'ci',
    description: 'CI mode: quality gate with coverage-aware scoring',
    flags: ['--fail-below', '--human', '--sarif', '--format', '--fail-on-errors', '--changes', '--staged', '--base', '--exclude', '--engine'],
  },
  {
    name: 'init',
    description: 'Initialize deep-slop configuration in a project',
    flags: ['--strict'],
  },
  {
    name: 'doctor',
    description: 'Check environment for deep-slop compatibility',
    flags: [],
  },
  {
    name: 'rules',
    description: 'List all available rules, search, or show rule details',
    flags: ['--search'],
  },
  {
    name: 'trend',
    description: 'Show score trend across recent scans',
    flags: ['--limit'],
  },
  {
    name: 'watch',
    description: 'Watch for file changes and auto-scan',
    flags: ['--interval', '--debounce', '--repair', '--once', '--target-score'],
  },
  {
    name: 'hook install',
    description: 'Install a deep-slop hook for an AI coding tool',
    flags: ['--claude', '--cursor', '--gemini', '--cline', '--global', '--project', '--quality-gate'],
  },
  {
    name: 'hook uninstall',
    description: 'Remove a deep-slop hook from an AI coding tool',
    flags: ['--claude', '--cursor', '--gemini', '--cline', '--global', '--project'],
  },
  {
    name: 'hook status',
    description: 'Show installed hooks status',
    flags: [],
  },
  {
    name: 'hook baseline',
    description: 'Capture quality gate baseline score',
    flags: ['--check'],
  },
  {
    name: 'agent repair',
    description: 'Run AI agent repair loop to improve code quality score',
    flags: ['--provider', '--target-score', '--max-turns', '--in-place', '--dry-run', '--apply', '--commit', '--pr'],
  },
  {
    name: 'agent providers',
    description: 'Show installed AI agent providers',
    flags: [],
  },
  {
    name: 'agent plan',
    description: 'Preview repair plan without running',
    flags: ['--provider', '--target-score', '--max-turns'],
  },
  {
    name: 'agent monitor start',
    description: 'Start monitoring a directory for changes',
    flags: ['--background', '--once', '--target-score', '--repair', '--interval', '--provider', '--max-turns'],
  },
  {
    name: 'agent monitor list',
    description: 'List all monitors',
    flags: [],
  },
  {
    name: 'agent monitor show',
    description: 'Show details for a specific monitor',
    flags: [],
  },
  {
    name: 'agent monitor stop',
    description: 'Stop a running monitor',
    flags: [],
  },
  {
    name: 'agent sessions',
    description: 'List all agent repair sessions',
    flags: [],
  },
  {
    name: 'agent show',
    description: 'Show details for a specific agent session',
    flags: [],
  },
  {
    name: 'agent apply',
    description: 'Apply changes from a completed session',
    flags: ['--in-place', '--commit'],
  },
  {
    name: 'agent stop',
    description: 'Stop a running agent session',
    flags: [],
  },
  {
    name: 'commands',
    description: 'Show this command reference',
    flags: [],
  },
]

/**
 * Render a formatted table of all commands.
 * Used by the `deep-slop commands` command.
 */
export function renderCommandReference(): void {
  console.log('')
  console.log(separator())
  console.log(styleBold('info', '  deep-slop command reference'))
  console.log(separator())
  console.log('')

  // Compute column widths
  const nameWidth = Math.max(...COMMANDS.map((c) => c.name.length), 10)
  const descWidth = 50

  // Header
  console.log(`  ${style('muted', 'Command'.padEnd(nameWidth))}  ${style('muted', 'Description'.padEnd(descWidth))}  ${style('muted', 'Flags')}`)
  console.log(`  ${'─'.repeat(nameWidth)}  ${'─'.repeat(descWidth)}  ${'─'.repeat(20)}`)

  for (const cmd of COMMANDS) {
    const nameStr = style('suggestion', cmd.name.padEnd(nameWidth))
    const descStr = cmd.description.padEnd(descWidth)
    const flagsStr = cmd.flags.length > 0
      ? cmd.flags.map((f) => style('muted', f)).join(', ')
      : style('muted', '—')
    console.log(`  ${nameStr}  ${descStr}  ${flagsStr}`)
  }

  console.log('')
  console.log(separator())
  console.log('')
}

