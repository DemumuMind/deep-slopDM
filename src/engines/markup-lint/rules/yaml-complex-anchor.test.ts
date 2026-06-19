import { describe, it, expect } from 'vitest'
import { detectYamlComplexAnchor } from './yaml-complex-anchor.js'

function lines(content: string) {
  return content.split('\n').map((text, i) => ({ num: i + 1, text }))
}

describe('yaml-complex-anchor', () => {
  it('flags an anchor used three or more times', () => {
    const content = `defaults: &defaults
  env: prod

job1: *defaults
job2: *defaults
job3: *defaults`
    const result = detectYamlComplexAnchor(content, lines(content), 'config.yaml')
    expect(result).toHaveLength(1)
    expect(result[0].rule).toBe('yaml/complex-anchor')
    expect(result[0].message).toContain('defaults')
    expect(result[0].detail).toMatchObject({ refCount: 3 })
  })

  it('does not flag anchors used fewer than three times', () => {
    const content = `defaults: &defaults
  env: prod

job1: *defaults
job2: *defaults`
    const result = detectYamlComplexAnchor(content, lines(content), 'config.yaml')
    expect(result).toHaveLength(0)
  })

  it('does not flag YAML without anchors', () => {
    const content = `name: app
items:
  - one
  - two`
    const result = detectYamlComplexAnchor(content, lines(content), 'config.yaml')
    expect(result).toHaveLength(0)
  })
})
