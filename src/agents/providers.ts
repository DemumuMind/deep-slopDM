// deep-slop-ignore-start ast-slop/copy-paste-signature
// deep-slop-ignore-start ast-slop/narrative-comment
// deep-slop-ignore-start ast-slop/trivial-comment
// deep-slop-ignore-start ast-slop/decorative-comment
// deep-slop-ignore-start ast-slop/console-leftover
// deep-slop-ignore-start ast-slop/swallowed-exception
// deep-slop-ignore-start ast-slop/as-any
// deep-slop-ignore-start dead-flow/unused-variable
// deep-slop-ignore-start import-intelligence/unused-symbol
// deep-slop-ignore-start arch-constraints/deep-nesting
// deep-slop-ignore-start perf-hints/n-plus-one

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
  windsurf: {
    command: 'windsurf',
    args: ['--agent'],
    promptMode: 'stdin',
    detectCommand: 'windsurf --version',
  },
  vscode: {
    command: 'code',
    args: ['--agent'],
    promptMode: 'stdin',
    detectCommand: 'code --version',
  },
  amp: {
    command: 'amp',
    args: [],
    promptMode: 'stdin',
    detectCommand: 'amp --version',
  },
  'gemini-cli': {
    command: 'gemini',
    args: [],
    promptMode: 'stdin',
    detectCommand: 'gemini --version',
  },
  kimi: {
    command: 'kimi',
    args: [],
    promptMode: 'stdin',
    detectCommand: 'kimi --version',
  },
  warp: {
    command: 'warp',
    args: ['agent'],
    promptMode: 'stdin',
    detectCommand: 'warp --version',
  },
  pi: {
    command: 'pi',
    args: [],
    promptMode: 'stdin',
    detectCommand: 'pi --version',
  },
  crush: {
    command: 'crush',
    args: [],
    promptMode: 'stdin',
    detectCommand: 'crush --version',
  },
  'deep-agents': {
    command: 'deep-agents',
    args: [],
    promptMode: 'stdin',
    detectCommand: 'deep-agents --version',
  },
  antigravity: {
    command: 'antigravity',
    args: [],
    promptMode: 'stdin',
    detectCommand: 'antigravity --version',
  },
  'dep-audit': {
    command: 'deep-slop',
    args: ['hook', 'audit', '--outdated'],
    promptMode: 'arg',
    detectCommand: 'deep-slop --version',
  },
  sentinel: {
    command: 'deep-slop',
    args: ['hook', 'sentinel', '--repair'],
    promptMode: 'arg',
    detectCommand: 'deep-slop --version',
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

// deep-slop-ignore-end perf-hints/n-plus-one
// deep-slop-ignore-end arch-constraints/deep-nesting
// deep-slop-ignore-end import-intelligence/unused-symbol
// deep-slop-ignore-end dead-flow/unused-variable
// deep-slop-ignore-end ast-slop/as-any
// deep-slop-ignore-end ast-slop/swallowed-exception
// deep-slop-ignore-end ast-slop/console-leftover
// deep-slop-ignore-end ast-slop/decorative-comment
// deep-slop-ignore-end ast-slop/trivial-comment
// deep-slop-ignore-end ast-slop/narrative-comment
// deep-slop-ignore-end ast-slop/copy-paste-signature
