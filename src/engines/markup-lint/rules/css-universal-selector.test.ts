import { describe, it, expect } from 'vitest'
import { detectCssUniversalSelector } from './css-universal-selector.js'

function lines(content: string) {
  return content.split('\n').map((text, i) => ({ num: i + 1, text }))
}

describe('css-universal-selector', () => {
  it('flags a universal selector reset', () => {
    const content = `* {
  box-sizing: border-box;
}`
    const result = detectCssUniversalSelector(content, lines(content), 'styles.css')
    expect(result).toHaveLength(1)
    expect(result[0].rule).toBe('css/universal-selector')
    expect(result[0].line).toBe(1)
  })

  it('flags universal selector in combinations', () => {
    const content = `*::before,
*::after {
  content: '';
}`
    const result = detectCssUniversalSelector(content, lines(content), 'styles.css')
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0].rule).toBe('css/universal-selector')
  })

  it('does not flag comments containing *', () => {
    const content = `/* universal selector */
.btn {
  color: red;
}`
    const result = detectCssUniversalSelector(content, lines(content), 'styles.css')
    expect(result).toHaveLength(0)
  })
})
