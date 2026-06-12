# Phase 7: Coding Agent Integrations

**Depends on:** Phase 5 (fix pipeline — agents delegate fixes)
**Objective:** Add flags like `--claude`, `--codex`, `--cursor` to the fix command, which delegate to coding agent CLIs

## Work

### Task 7.1: Agent dispatcher
**Files:**
- Create: `src/agents/dispatcher.ts`
- Create: `src/agents/providers.ts`
- Modify: `src/cli.ts` (fix command agent flags)

Agent provider map:
```typescript
const AGENT_PROVIDERS = {
  claude: { command: 'claude', args: ['--print'], prompt: (diags) => `Fix these issues:\n${formatDiags(diags)}` },
  codex: { command: 'codex', args: ['--quiet'], prompt: (diags) => `Fix these issues:\n${formatDiags(diags)}` },
  cursor: { command: 'cursor-agent', args: [], prompt: ... },
  opencode: { command: 'opencode', args: [], prompt: ... },
  aider: { command: 'aider', args: ['--yes'], prompt: ... },
}
```

### Task 7.2: Fix command agent flags
**Files:**
- Modify: `src/cli.ts`

Add flags: `--claude`, `--codex`, `--cursor`, `--opencode`, `--aider`
Behavior:
1. Run scan, collect fixable diagnostics
2. Format diagnostics as prompt text
3. Spawn agent CLI subprocess with prompt
4. Wait for agent to finish
5. Re-scan to verify improvement

### Task 7.3: Agent prompt formatting
**Files:**
- Create: `src/agents/prompt-format.ts`

Format diagnostics as clear, actionable prompt for coding agents:
- Group by file
- Include rule explanation from `deep_slop_why`
- Include suggestion text
- Include before/after code snippets where available

## Acceptance criteria
- [ ] `deep-slop fix . --claude` spawns Claude Code with fix prompt
- [ ] `deep-slop fix . --codex` spawns Codex CLI with fix prompt
- [ ] At least 3 agent providers configured (claude, codex, aider)
- [ ] Agent prompts include rule explanations and suggestions
- [ ] After agent finishes, re-scan reports score improvement
- [ ] `npx tsc` compiles cleanly

## Evidence commands
```bash
# Agent help shows flags
node dist/cli.js fix --help | grep -c "claude\|codex\|aider"
# Expected: 3+

npx tsc
npx vitest run
```

## Mandatory commands
```bash
npx tsc
npx vitest run
```

## Cleanliness expectations
- No debug prints
- No TODO/FIXME
- Clean override: no
