import { describe, it, expect } from 'vitest'
import { detectCssImportantOveruse } from './css-important-overuse.js'

function lines(content: string) {
  return content.split('\n').map((text, i) => ({ num: i + 1, text }))
}

describe('css-important-overuse', () => {
  it('reports when !important exceeds the threshold', () => {
    const content = `.a { color: red !important; }
.b { margin: 0 !important; }
.c { padding: 1px !important; }
.d { border: none !important; }`
    const result = detectCssImportantOveruse(content, lines(content), 'styles.css')
    expect(result).toHaveLength(1)
    expect(result[0].rule).toBe('css/important-overuse')
    expect(result[0].message).toContain('4')
    expect(result[0].detail).toMatchObject({ count: 4, max: 3 })
  })

  it('allows up to three !important declarations', () => {
    const content = `.a { color: red !important; }
.b { margin: 0 !important; }
.c { padding: 1px !important; }`
    const result = detectCssImportantOveruse(content, lines(content), 'styles.css')
    expect(result).toHaveLength(0)
  })

  it('does not flag files without !important', () => {
    const content = `.x { color: red; }
.y { margin: 0; }`
    const result = detectCssImportantOveruse(content, lines(content), 'styles.css')
    expect(result).toHaveLength(0)
  })
})
