import { describe, it, expect } from 'vitest'
import { detectCssDuplicateProperty } from './css-duplicate-property.js'

function lines(content: string) {
  return content.split('\n').map((text, i) => ({ num: i + 1, text }))
}

describe('css-duplicate-property', () => {
  it('reports duplicate property in the same rule block', () => {
    const content = `.btn {
  color: red;
  color: blue;
}`
    const result = detectCssDuplicateProperty(content, lines(content), 'styles.css')
    expect(result).toHaveLength(1)
    expect(result[0].rule).toBe('css/duplicate-property')
    expect(result[0].message).toContain('color')
    expect(result[0].line).toBe(3)
    expect(result[0].detail).toMatchObject({ property: 'color', firstLine: 2 })
  })

  it('does not flag properties across different rules', () => {
    const content = `.btn {
  color: red;
}
.link {
  color: blue;
}`
    const result = detectCssDuplicateProperty(content, lines(content), 'styles.css')
    expect(result).toHaveLength(0)
  })

  it('does not flag unique properties', () => {
    const content = `.card {
  color: red;
  background: white;
  font-size: 14px;
}`
    const result = detectCssDuplicateProperty(content, lines(content), 'styles.css')
    expect(result).toHaveLength(0)
  })
})
