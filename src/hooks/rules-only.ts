import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { getSkillContent, listSkills } from '../agent/skills/index.js'

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

/** Generate rules text from skill content */
function generateRulesText(): string {
  const skill = getSkillContent('claude-code')
  if (!skill) return 'Run deep-slop scan before committing. Score must be ≥ 70.'
  // Extract just the quality rules portion
  const lines = skill.split('\n')
  const rulesStart = lines.findIndex((l: string) => l.includes('Common AI slop'))
  if (rulesStart === -1) return skill
  return lines.slice(rulesStart + 1).join('\n').trim()
}

/** Install rules-only hook for a specific agent */
export async function installRulesOnlyHook(
  agent: string,
  rootDir: string,
): Promise<{ installed: boolean; path: string }> {
  const entry = rulesOnlyAgents.find((a) => a.agent === agent)
  if (!entry) return { installed: false, path: '' }

  const filePath = resolve(rootDir, entry.configPath)
  let existing = ''
  try {
    existing = await readFile(filePath, 'utf8')
  } catch {
    existing = ''
  }

  const rules = generateRulesText()
  const updated = entry.injector(existing, rules)
  await writeFile(filePath, updated, 'utf8')
  return { installed: true, path: filePath }
}

/** List available rules-only agents */
export function listRulesOnlyAgents(): string[] {
  return rulesOnlyAgents.map((a) => a.agent)
}
