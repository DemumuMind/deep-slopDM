import { describe, it, expect } from 'vitest'
import { detectYamlMultiDocUnseparated } from './yaml-multi-doc.js'

function lines(content: string) {
  return content.split('\n').map((text, i) => ({ num: i + 1, text }))
}

describe('yaml-multi-doc-unseparated', () => {
  it('flags multiple documents without separator', () => {
    const content = `name: doc1


items: []


name: doc2


items: []`
    const result = detectYamlMultiDocUnseparated(content, lines(content), 'config.yaml')
    expect(result).toHaveLength(1)
    expect(result[0].rule).toBe('yaml/multi-doc-unseparated')
  })

  it('does not flag when explicit separator is present', () => {
    const content = `name: doc1
---
name: doc2`
    const result = detectYamlMultiDocUnseparated(content, lines(content), 'config.yaml')
    expect(result).toHaveLength(0)
  })

  it('does not flag a single compact document', () => {
    const content = `name: app
version: 1
items:
  - a
  - b`
    const result = detectYamlMultiDocUnseparated(content, lines(content), 'config.yaml')
    expect(result).toHaveLength(0)
  })
})
