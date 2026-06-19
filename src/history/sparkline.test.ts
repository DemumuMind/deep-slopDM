import { describe, it, expect } from 'vitest'
import { sparkline, deltaText } from './sparkline.js'

describe('sparkline', () => {
  it('renders values into block characters', () => {
    expect(sparkline([0, 50, 100])).toBe('▁▅█')
  })

  it('returns empty string for empty input', () => {
    expect(sparkline([])).toBe('')
  })

  it('pads values to the requested width', () => {
    expect(sparkline([100], 3)).toBe('▁▁█')
  })

  it('downsamples values when there are more than the width', () => {
    const values = [0, 25, 50, 75, 100]
    expect(sparkline(values, 3)).toHaveLength(3)
  })

  it('clamps values outside 0-100', () => {
    expect(sparkline([-10, 150])).toBe('▁█')
  })
})

describe('deltaText', () => {
  it('returns an em dash when there is no previous value', () => {
    expect(deltaText(10, null)).toBe('—')
  })

  it('shows positive delta', () => {
    expect(deltaText(10, 5)).toBe('+5 ▲')
  })

  it('shows negative delta', () => {
    expect(deltaText(5, 10)).toBe('-5 ▼')
  })

  it('shows no change', () => {
    expect(deltaText(7, 7)).toBe('0 ─')
  })
})
