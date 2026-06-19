import { describe, it, expect } from 'vitest'
import { detectRepeatedConstants } from './repeated-constant.js'
import type { StringOccurrence } from '../shared.js'

function makeOccurrences(value: string, count: number, filePrefix = 'src'): StringOccurrence[] {
  const result: StringOccurrence[] = []
  for (let i = 0; i < count; i++) {
    result.push({
      filePath: `${filePrefix}/file${i}.ts`,
      line: 1,
      col: 1,
      value,
      raw: `"${value}"`,
      lineText: `const x = "${value}"`,
    })
  }
  return result
}

describe('repeated-constant exclusions', () => {
  it('skips common English phrases like "project directory"', () => {
    const diags = detectRepeatedConstants(makeOccurrences('project directory', 3), '/root')
    expect(diags).toHaveLength(0)
  })

  it('skips CLI flag descriptions like "Output as JSON"', () => {
    const diags = detectRepeatedConstants(makeOccurrences('Output as JSON', 3), '/root')
    expect(diags).toHaveLength(0)
  })

  it('skips filename references like "pattern-docs.ts"', () => {
    const diags = detectRepeatedConstants(makeOccurrences('pattern-docs.ts', 3), '/root')
    expect(diags).toHaveLength(0)
  })

  it('skips UI status labels like "Needs Work"', () => {
    const diags = detectRepeatedConstants(makeOccurrences('Needs Work', 3), '/root')
    expect(diags).toHaveLength(0)
  })

  it('still flags repeated meaningful constants', () => {
    const diags = detectRepeatedConstants(makeOccurrences('retry limit 5', 3), '/root')
    expect(diags.length).toBeGreaterThan(0)
  })
})
