import { describe, it, expect } from 'vitest'
import { rulesOnlyAgents, type RulesOnlyAgent } from './rules-only.js'

describe('rules-only hook agents', () => {
  it('exports a non-empty list of agents', () => {
    expect(rulesOnlyAgents.length).toBeGreaterThan(0)
  })

  it('includes expected agents', () => {
    const names = rulesOnlyAgents.map((a) => a.agent)
    expect(names).toContain('codex')
    expect(names).toContain('windsurf')
    expect(names).toContain('cline')
    expect(names).toContain('copilot')
    expect(names).toContain('kilo-code')
    expect(names).toContain('antigravity')
  })

  it('each agent has a config path and injector', () => {
    for (const agent of rulesOnlyAgents) {
      expect(agent.configPath).toBeTruthy()
      expect(typeof agent.injector).toBe('function')
    }
  })

  it('each injector appends rules when deep-slop is not present', () => {
    const rules = 'Run deep-slop scan before committing.'
    for (const agent of rulesOnlyAgents) {
      const existing = '# Existing rules\n'
      const result = agent.injector(existing, rules)
      expect(result).toContain('deep-slop')
      expect(result.length).toBeGreaterThan(existing.length)
    }
  })

  it('each injector returns existing content unchanged when deep-slop is already present', () => {
    const rules = 'Run deep-slop scan.'
    for (const agent of rulesOnlyAgents) {
      const existing = '# Existing rules\nRun deep-slop scan.\n'
      const result = agent.injector(existing, rules)
      expect(result).toBe(existing)
    }
  })

  it('copilot uses a level-2 heading for its section', () => {
    const copilot = rulesOnlyAgents.find((a) => a.agent === 'copilot') as RulesOnlyAgent
    const result = copilot.injector('', 'rules')
    expect(result).toContain('## deep-slop Quality Rules')
  })
})
