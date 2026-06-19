import { describe, it, expect } from 'vitest'
import { ruleLabel, knownRuleIds } from './rule-labels.js'

describe('rule-labels', () => {
  describe('ruleLabel', () => {
    it('returns a human-readable label for known rules', () => {
      expect(ruleLabel('ast-slop/todo-stub')).toBe('TODO Stub')
      expect(ruleLabel('security-deep/eval-usage')).toBe('eval() Usage')
      expect(ruleLabel('python-deep/bare-except')).toBe('Bare except')
    })

    it('falls back to the rule id for unknown rules', () => {
      expect(ruleLabel('custom/unknown-rule')).toBe('custom/unknown-rule')
    })
  })

  describe('knownRuleIds', () => {
    it('returns an array of rule ids', () => {
      const ids = knownRuleIds()
      expect(ids.length).toBeGreaterThan(0)
      expect(ids).toContain('ast-slop/todo-stub')
      expect(ids.every((id) => typeof id === 'string')).toBe(true)
    })
  })
})
