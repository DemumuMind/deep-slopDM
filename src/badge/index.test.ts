import { describe, it, expect } from 'vitest'
import { scoreColor, generateBadgeUrl, generateBadgeMarkdown, generateBadgeEndpointUrl } from './index.js'

describe('badge', () => {
  describe('scoreColor', () => {
    it('returns green for scores 80+', () => {
      expect(scoreColor(100)).toBe('green')
      expect(scoreColor(80)).toBe('green')
      expect(scoreColor(95)).toBe('green')
    })

    it('returns yellow for scores 50-79', () => {
      expect(scoreColor(79)).toBe('yellow')
      expect(scoreColor(50)).toBe('yellow')
      expect(scoreColor(65)).toBe('yellow')
    })

    it('returns orange for scores 30-49', () => {
      expect(scoreColor(49)).toBe('orange')
      expect(scoreColor(30)).toBe('orange')
    })

    it('returns red for scores 0-29', () => {
      expect(scoreColor(29)).toBe('red')
      expect(scoreColor(0)).toBe('red')
    })
  })

  describe('generateBadgeUrl', () => {
    it('generates correct URL with score', () => {
      const url = generateBadgeUrl('myorg', 'myrepo', 85)
      expect(url).toContain('deep--slop-85-green')
      expect(url).toContain('img.shields.io')
    })

    it('generates pending URL without score', () => {
      const url = generateBadgeUrl('myorg', 'myrepo')
      expect(url).toContain('deep--slop-pending-lightgrey')
    })

    it('generates red URL for low score', () => {
      const url = generateBadgeUrl('myorg', 'myrepo', 10)
      expect(url).toContain('10-red')
    })
  })

  describe('generateBadgeMarkdown', () => {
    it('generates markdown with badge and link', () => {
      const md = generateBadgeMarkdown('myorg', 'myrepo', 85)
      expect(md).toContain('![deep-slop]')
      expect(md).toContain('img.shields.io')
      expect(md).toContain('github.com/myorg/myrepo')
    })
  })

  describe('generateBadgeEndpointUrl', () => {
    it('generates endpoint URL for dynamic badge', () => {
      const url = generateBadgeEndpointUrl('myorg', 'myrepo')
      expect(url).toContain('img.shields.io/endpoint')
      expect(url).toContain('deep-slop.dev/api/badge/myorg/myrepo')
    })
  })
})
