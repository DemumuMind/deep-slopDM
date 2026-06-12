// ── Agent Provider Definitions ────────────────────────
// Maps agent flags (--claude, --codex, etc.) to CLI commands

export interface AgentProvider {
  /** CLI command to spawn */
  command: string
  /** Arguments for the command */
  args: string[]
  /** How to format the prompt for this agent */
  promptMode: 'stdin' | 'arg' | 'file'
  /** Whether this agent is available on the system */
  detectCommand: string
}

export const AGENT_PROVIDERS: Record<string, AgentProvider> = {
  claude: {
    command: 'claude',
    args: ['--print'],
    promptMode: 'stdin',
    detectCommand: 'claude --version',
  },
  codex: {
    command: 'codex',
    args: ['--quiet'],
    promptMode: 'stdin',
    detectCommand: 'codex --version',
  },
  cursor: {
    command: 'cursor-agent',
    args: [],
    promptMode: 'stdin',
    detectCommand: 'cursor-agent --version',
  },
  opencode: {
    command: 'opencode',
    args: [],
    promptMode: 'stdin',
    detectCommand: 'opencode --version',
  },
  aider: {
    command: 'aider',
    args: ['--yes-always', '--no-auto-commits'],
    promptMode: 'stdin',
    detectCommand: 'aider --version',
  },
  goose: {
    command: 'goose',
    args: ['run'],
    promptMode: 'stdin',
    detectCommand: 'goose --version',
  },
}

/** Detect if an agent is available on the system */
export async function isAgentAvailable(provider: AgentProvider): Promise<boolean> {
  try {
    const { execSync } = await import('node:child_process')
    execSync(provider.detectCommand, { stdio: 'pipe', timeout: 5000 })
    return true
  } catch {
    return false
  }
}
