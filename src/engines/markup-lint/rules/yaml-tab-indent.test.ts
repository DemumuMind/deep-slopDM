import { describe, it, expect } from 'vitest'
import { detectYamlTabIndent } from './yaml-tab-indent.js'

function lines(content: string) {
  return content.split('\n').map((text, i) => ({ num: i + 1, text }))
}

describe('yaml-tab-indent', () => {
  it('flags a line that starts with a tab', () => {
    const content = 'name: value\n\titems:\n  - one'
    const result = detectYamlTabIndent(content, lines(content), 'config.yaml')
    expect(result).toHaveLength(1)
    expect(result[0].rule).toBe('yaml/tab-indent')
    expect(result[0].line).toBe(2)
  })

  it('suggests replacing tabs with spaces', () => {
    const content = '\tfoo: bar'
    const result = detectYamlTabIndent(content, lines(content), 'config.yaml')
    expect(result[0].suggestion?.text).toBe('  foo: bar')
  })

  it('does not flag space-indented YAML', () => {
    const content = `name: value
items:
  - one
  - two`
    const result = detectYamlTabIndent(content, lines(content), 'config.yaml')
    expect(result).toHaveLength(0)
  })
})
