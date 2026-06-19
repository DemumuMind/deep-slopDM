// ── Rules-only hook installers ──────────────────────────────
// These agents don't support runtime adapters (PostToolUse/afterFileEdit).
// Instead, we inject deep-slop rules into their config files
// so the agent reads quality rules on every turn.

interface RulesOnlyAgent {
  agent: string
  configPath: string
  injector: (content: string, rules: string) => string
}

const rulesOnlyAgents: RulesOnlyAgent[] = [
  {
    agent: 'codex',
    configPath: 'AGENTS.md',
    injector: (existing, rules) => {
      if (existing.includes('deep-slop')) return existing
      return existing + '\n\n# deep-slop Quality Rules\n\n' + rules
    },
  },
  {
    agent: 'windsurf',
    configPath: '.windsurfrules',
    injector: (existing, rules) => {
      if (existing.includes('deep-slop')) return existing
      return existing + '\n\n# deep-slop Quality Rules\n\n' + rules
    },
  },
  {
    agent: 'cline',
    configPath: '.clinerules',
    injector: (existing, rules) => {
      if (existing.includes('deep-slop')) return existing
      return existing + '\n\n# deep-slop Quality Rules\n\n' + rules
    },
  },
  {
    agent: 'kilo-code',
    configPath: '.kilorules',
    injector: (existing, rules) => {
      if (existing.includes('deep-slop')) return existing
      return existing + '\n\n# deep-slop Quality Rules\n\n' + rules
    },
  },
  {
    agent: 'copilot',
    configPath: '.github/copilot-instructions.md',
    injector: (existing, rules) => {
      if (existing.includes('deep-slop')) return existing
      return existing + '\n\n## deep-slop Quality Rules\n\n' + rules
    },
  },
  {
    agent: 'antigravity',
    configPath: 'ANTIGRAVITY.md',
    injector: (existing, rules) => {
      if (existing.includes('deep-slop')) return existing
      return existing + '\n\n# deep-slop Quality Rules\n\n' + rules
    },
  },
]

