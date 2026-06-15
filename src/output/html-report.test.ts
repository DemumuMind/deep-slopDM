import { describe, it, expect } from 'vitest'
import { generateHTMLReport } from './html-report.js'
import type { HistoryRecord } from '../history/store.js'

function makeRecord(overrides: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    timestamp: new Date().toISOString(),
    score: 75,
    errors: 1,
    warnings: 2,
    info: 3,
    suggestions: 4,
    filesScanned: 10,
    engines: ['ast-slop'],
    durationMs: 1000,
    ...overrides,
  }
}

describe('generateHTMLReport', () => {
  it('returns a complete HTML document', () => {
    const html = generateHTMLReport([])
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('</html>')
  })

  it('includes the title and root directory in the output', () => {
    const html = generateHTMLReport([], { title: 'My Report', rootDir: '/project' })
    expect(html).toContain('My Report')
    expect(html).toContain('/project')
  })

  it('renders an empty state when no history records are provided', () => {
    const html = generateHTMLReport([])
    expect(html).toContain('No history available')
    expect(html).toContain('deep-slop scan')
  })

  it('renders summary cards with latest score, average score, and total scans', () => {
    const records = [
      makeRecord({ score: 60, errors: 2, warnings: 1, info: 0, suggestions: 0 }),
      makeRecord({ score: 80, errors: 0, warnings: 0, info: 0, suggestions: 1 }),
    ]
    const html = generateHTMLReport(records)
    expect(html).toContain('Latest Score')
    expect(html).toContain('80')
    expect(html).toContain('Average Score')
    expect(html).toContain('70')
    expect(html).toContain('Total Scans')
    expect(html).toContain('2')
  })

  it('renders an inline SVG score trend chart', () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeRecord({ score: 50 + i * 10, timestamp: new Date(Date.now() - i * 1000).toISOString() }),
    ).reverse()
    const html = generateHTMLReport(records)
    expect(html).toContain('<svg')
    expect(html).toContain('Score Trend')
    expect(html).toContain('chart-line')
    expect(html).toContain('chart-area')
  })

  it('renders an inline SVG severity breakdown chart', () => {
    const records = [
      makeRecord({ errors: 1, warnings: 2, info: 3, suggestions: 4 }),
      makeRecord({ errors: 0, warnings: 1, info: 2, suggestions: 3 }),
    ]
    const html = generateHTMLReport(records)
    expect(html).toContain('Severity Breakdown')
    expect(html).toContain('Errors')
    expect(html).toContain('Warnings')
    expect(html).toContain('Info')
    expect(html).toContain('Suggestions')
  })

  it('renders an engine usage table', () => {
    const records = [
      makeRecord({ engines: ['ast-slop', 'dead-flow'], durationMs: 1200 }),
      makeRecord({ engines: ['ast-slop'], durationMs: 800 }),
    ]
    const html = generateHTMLReport(records)
    expect(html).toContain('Engine Usage')
    expect(html).toContain('ast-slop')
    expect(html).toContain('dead-flow')
    expect(html).toContain('Scans Used')
    expect(html).toContain('Avg Duration')
  })

  it('renders a recent scans table', () => {
    const records = [
      makeRecord({ score: 65, timestamp: '2024-01-01T00:00:00.000Z' }),
      makeRecord({ score: 85, timestamp: '2024-01-02T00:00:00.000Z' }),
    ]
    const html = generateHTMLReport(records)
    expect(html).toContain('Recent Scans')
    expect(html).toContain('When')
    expect(html).toContain('Score')
    expect(html).toContain('Duration')
  })

  it('escapes HTML entities in the title and root directory', () => {
    const html = generateHTMLReport([], {
      title: '<script>alert(1)</script>',
      rootDir: '/foo<bar>',
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('/foo&lt;bar&gt;')
  })

  it('escapes HTML entities in engine names', () => {
    const records = [makeRecord({ engines: ['ast<slop>'] })]
    const html = generateHTMLReport(records)
    expect(html).toContain('ast&lt;slop&gt;')
    expect(html).not.toContain('ast<slop>')
  })

  it('escapes HTML entities in formatted dates', () => {
    const records = [makeRecord({ timestamp: '2024-06-15T12:00:00.000Z' })]
    const html = generateHTMLReport(records)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('</html>')
  })
})
