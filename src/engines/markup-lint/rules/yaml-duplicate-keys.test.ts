import { describe, it, expect } from 'vitest'
import { detectYamlDuplicateKeys } from './yaml-duplicate-keys.js'

function lines(content: string) {
  return content.split('\n').map((text, i) => ({ num: i + 1, text }))
}

describe('yaml-duplicate-keys', () => {
  it('flags duplicate top-level keys', () => {
    const content = `name: first
name: second`
    const result = detectYamlDuplicateKeys(content, lines(content), 'config.yaml')
    expect(result).toHaveLength(1)
    expect(result[0].rule).toBe('yaml/duplicate-keys')
    expect(result[0].message).toContain('name')
    expect(result[0].line).toBe(2)
  })

  it('flags duplicate nested keys in the same scope', () => {
    const content = `server:
  port: 3000
  port: 3001`
    const result = detectYamlDuplicateKeys(content, lines(content), 'config.yaml')
    expect(result).toHaveLength(1)
    expect(result[0].message).toContain('port')
  })

  it('does not flag the same key in different scopes', () => {
    const content = `server:
  port: 3000
client:
  port: 4000`
    const result = detectYamlDuplicateKeys(content, lines(content), 'config.yaml')
    expect(result).toHaveLength(0)
  })
})
