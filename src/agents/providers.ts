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

/** Check all providers for availability */
export async function detectAllProviders(): Promise<{ name: string, available: boolean }[]> {
  const entries = Object.entries(AGENT_PROVIDERS)
  const results = await Promise.all(
    entries.map(async ([name, provider]) => ({
      name,
      available: await isAgentAvailable(provider),
    })),
  )
  return results
}

/** Run a provider CLI, piping the prompt to stdin, capturing stdout */
export async function runProvider(
  providerName: string,
  prompt: string,
  options: { targetDir: string, maxTurns?: number },
): Promise<{ success: boolean, output: string }> {
  const provider = AGENT_PROVIDERS[providerName]
  if (!provider) {
    return {
      success: false,
      output: `Unknown provider: ${providerName}. Available: ${Object.keys(AGENT_PROVIDERS).join(', ')}`,
    }
  }

  // Check availability first
  const available = await isAgentAvailable(provider)
  if (!available) {
    return {
      success: false,
      output: `Provider "${providerName}" is not available. Install it or check your PATH.`,
    }
  }

  const { spawn } = await import('node:child_process')
  const timeoutMs = 5 * 60 * 1000 // 5 min default

  return new Promise((resolve) => {
    const args = [...provider.args]
    if (options.maxTurns && providerName === 'codex') {
      args.push('--max-turns', String(options.maxTurns))
    }

    const child = spawn(provider.command, args, {
      cwd: options.targetDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    // Pipe prompt to stdin for 'stdin' mode
    if (provider.promptMode === 'stdin') {
      child.stdin.write(prompt)
      child.stdin.end()
    }

    // Timeout guard
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      resolve({
        success: false,
        output: `Provider timed out after ${timeoutMs / 1000}s`,
      })
    }, timeoutMs)

    child.on('close', (code: number | null) => {
      clearTimeout(timer)
      const success = code === 0
      resolve({
        success,
        output: stdout.trim() || stderr.trim() || `Process exited with code ${code}`,
      })
    })

    child.on('error', (err: Error) => {
      clearTimeout(timer)
      resolve({
        success: false,
        output: `Failed to spawn provider: ${err.message}`,
      })
    })
  })
}
