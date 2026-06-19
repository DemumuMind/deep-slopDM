import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { execSync } from 'node:child_process'
import {
  getChangedFiles,
  getStagedFiles,
  baseRefExists,
  filterToChanged,
} from './git-diff.js'

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

describe('git-diff', () => {
  let execMock: Mock<(...args: unknown[]) => string>

  beforeEach(() => {
    execMock = execSync as unknown as Mock<(...args: unknown[]) => string>
    execMock.mockReturnValue('')
  })

  describe('getChangedFiles', () => {
    it('returns the list of changed files', async () => {
      execMock.mockReturnValue('src/a.ts\nsrc/b.js\n')
      const result = await getChangedFiles()
      expect(result).toEqual(['src/a.ts', 'src/b.js'])
      expect(execMock).toHaveBeenCalledWith('git diff --name-only HEAD', expect.any(Object))
    })

    it('uses a custom base ref when provided', async () => {
      execMock.mockReturnValue('src/c.ts\n')
      await getChangedFiles('origin/main')
      expect(execMock).toHaveBeenCalledWith('git diff --name-only origin/main', expect.any(Object))
    })

    it('returns empty array when git fails', async () => {
      execMock.mockImplementation(() => {
        throw new Error('git error')
      })
      const result = await getChangedFiles()
      expect(result).toEqual([])
    })
  })

  describe('getStagedFiles', () => {
    it('returns staged files', async () => {
      execMock.mockReturnValue('src/x.ts\n')
      const result = await getStagedFiles()
      expect(result).toEqual(['src/x.ts'])
    })

    it('returns empty array when git fails', async () => {
      execMock.mockImplementation(() => {
        throw new Error('git error')
      })
      const result = await getStagedFiles()
      expect(result).toEqual([])
    })
  })

  describe('baseRefExists', () => {
    it('returns true for an existing ref', async () => {
      execMock.mockReturnValue('abc123')
      const result = await baseRefExists('main')
      expect(result).toBe(true)
    })

    it('returns false when the ref does not exist', async () => {
      execMock.mockImplementation(() => {
        throw new Error('not a valid ref')
      })
      const result = await baseRefExists('missing')
      expect(result).toBe(false)
    })
  })

  describe('filterToChanged', () => {
    it('matches files by basename', () => {
      const files = ['/home/project/src/a.ts', '/home/project/src/b.js']
      const changed = ['a.ts']
      expect(filterToChanged(files, changed)).toEqual(['/home/project/src/a.ts'])
    })

    it('matches files by trailing relative path', () => {
      const files = ['/home/project/src/nested/c.ts']
      const changed = ['src/nested/c.ts']
      expect(filterToChanged(files, changed)).toEqual(['/home/project/src/nested/c.ts'])
    })

    it('returns empty when either input is empty', () => {
      expect(filterToChanged(['/a.ts'], [])).toEqual([])
      expect(filterToChanged([], ['a.ts'])).toEqual([])
    })
  })
})
