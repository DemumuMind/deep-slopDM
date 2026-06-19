import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { relativeTime } from './relative-time.js'

describe('relativeTime', () => {
  const now = new Date('2024-06-01T12:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for the near future', () => {
    const future = new Date(now.getTime() + 60_000).toISOString()
    expect(relativeTime(future)).toBe('just now')
  })

  it('returns "just now" for very recent timestamps', () => {
    const recent = new Date(now.getTime() - 5_000).toISOString()
    expect(relativeTime(recent)).toBe('just now')
  })

  it('returns seconds ago for recent timestamps', () => {
    const ts = new Date(now.getTime() - 45_000).toISOString()
    expect(relativeTime(ts)).toBe('45 sec ago')
  })

  it('returns minutes ago', () => {
    expect(relativeTime(new Date(now.getTime() - 60_000).toISOString())).toBe('1 min ago')
    expect(relativeTime(new Date(now.getTime() - 5 * 60_000).toISOString())).toBe('5 min ago')
  })

  it('returns hours ago', () => {
    expect(relativeTime(new Date(now.getTime() - 60 * 60_000).toISOString())).toBe('1 hour ago')
    expect(relativeTime(new Date(now.getTime() - 3 * 60 * 60_000).toISOString())).toBe('3 hours ago')
  })

  it('returns days ago', () => {
    expect(relativeTime(new Date(now.getTime() - 24 * 60 * 60_000).toISOString())).toBe('1 day ago')
    expect(relativeTime(new Date(now.getTime() - 5 * 24 * 60 * 60_000).toISOString())).toBe('5 days ago')
  })

  it('returns months ago', () => {
    expect(relativeTime(new Date(now.getTime() - 30 * 24 * 60 * 60_000).toISOString())).toBe('1 month ago')
    expect(relativeTime(new Date(now.getTime() - 90 * 24 * 60 * 60_000).toISOString())).toBe('3 months ago')
  })
})
