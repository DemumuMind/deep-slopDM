import { resolve } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'

// ── Agent skill templates ────────────────────────────────────
// Each agent gets a SKILL.md that fires every turn,
// reminding it to check code quality before committing.

const SKILLS_DIR = 'skills'

interface AgentSkill {
  agent: string
  filename: string
  content: string
}

const skills: AgentSkill[] = [
  {
    agent: 'claude-code',
    filename: 'SKILL.md',
    content: `# deep-slop — AI Code Quality Gate

You have access to the deep-slop quality gate. Run it BEFORE finalizing any code change.

## When to run
- After writing or modifying code files
- Before committing changes
- When reviewing PRs

## How to run
\`\`\`bash
npx deep-slop scan . --exclude node_modules dist
npx deep-slop fix . --safe    # auto-fix safe issues
npx deep-slop fix . --plan    # preview what would be fixed
\`\`\`

## Quality gate
- Score must be ≥ 70/100 before committing
- If score drops after your changes, rollback and fix
- Focus on error and warning diagnostics first

## Common AI slop patterns to avoid
- Empty catch blocks — always handle or comment why
- \`as any\` casts — use proper types
- Narrative comments — remove "This function does X..."
- Console.log leftovers — remove debug statements
- Duplicate code — extract shared helpers
- Unused imports/variables — clean up
`,
  },
  {
    agent: 'cursor',
    filename: '.cursorrules',
    content: `# deep-slop Quality Gate

After every file edit, run:
\`\`\`bash
npx deep-slop scan . --exclude node_modules dist
\`\`\`

Score must be ≥ 70 before committing. Fix errors and warnings first.
`,
  },
  {
    agent: 'codex',
    filename: 'AGENTS.md',
    content: `# deep-slop Integration

Run \`npx deep-slop scan . --exclude node_modules dist\` after code changes.
Score must be ≥ 70 before committing. Fix errors and warnings first.
`,
  },
  {
    agent: 'gemini',
    filename: 'GEMINI.md',
    content: `# deep-slop Quality Gate

After code changes, run: \`npx deep-slop scan . --exclude node_modules dist\`
Score must be ≥ 70 before committing.
`,
  },
  {
    agent: 'windsurf',
    filename: '.windsurfrules',
    content: `# deep-slop Quality Gate

After code changes, run: \`npx deep-slop scan . --exclude node_modules dist\`
Score must be ≥ 70 before committing.
`,
  },
  {
    agent: 'cline',
    filename: '.clinerules',
    content: `# deep-slop Quality Gate

After code changes, run: \`npx deep-slop scan . --exclude node_modules dist\`
Score must be ≥ 70 before committing.
`,
  },
]

/** Install a skill for a specific agent into the project root */
export async function installSkill(
  agent: string,
  rootDir: string,
): Promise<{ installed: boolean; path: string }> {
  const skill = skills.find((s) => s.agent === agent)
  if (!skill) return { installed: false, path: '' }

  const dir = resolve(rootDir, SKILLS_DIR)
  await mkdir(dir, { recursive: true })
  const filePath = resolve(dir, skill.filename)
  await writeFile(filePath, skill.content, 'utf8')
  return { installed: true, path: filePath }
}

/** Get the content for an agent skill (for rules-only hooks) */
export function getSkillContent(agent: string): string | null {
  const skill = skills.find((s) => s.agent === agent)
  return skill?.content ?? null
}

/** List all available agent skills */
export function listSkills(): { agent: string; filename: string }[] {
  return skills.map((s) => ({ agent: s.agent, filename: s.filename }))
}
