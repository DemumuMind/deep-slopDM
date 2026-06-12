import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkForUpdate, showUpdateNotification } from './update-notifier.js'

describe('update-notifier', () => {
  describe('checkForUpdate', () => {
    const originalCI = process.env.CI
    const originalNoUpdate = process.env.NO_UPDATE_NOTIFIER
    const originalDeepSlopNoUpdate = process.env.DEEP_SLOP_NO_UPDATE_NOTIFIER

    beforeEach(() => {
      delete process.env.CI
      delete process.env.NO_UPDATE_NOTIFIER
      delete process.env.DEEP_SLOP_NO_UPDATE_NOTIFIER
    })

    afterEach(() => {
      if (originalCI !== undefined) process.env.CI = originalCI
      else delete process.env.CI
      if (originalNoUpdate !== undefined) process.env.NO_UPDATE_NOTIFIER = originalNoUpdate
      else delete process.env.NO_UPDATE_NOTIFIER
      if (originalDeepSlopNoUpdate !== undefined) process.env.DEEP_SLOP_NO_UPDATE_NOTIFIER = originalDeepSlopNoUpdate
      else delete process.env.DEEP_SLOP_NO_UPDATE_NOTIFIER
    })

    it('returns null when CI environment is set', async () => {
      process.env.CI = 'true'
      expect(await checkForUpdate()).toBeNull()
    })

    it('returns null when NO_UPDATE_NOTIFIER is set', async () => {
      process.env.NO_UPDATE_NOTIFIER = '1'
      expect(await checkForUpdate()).toBeNull()
    })

    it('returns null when DEEP_SLOP_NO_UPDATE_NOTIFIER is set', async () => {
      process.env.DEEP_SLOP_NO_UPDATE_NOTIFIER = '1'
      expect(await checkForUpdate()).toBeNull()
    })
  })

  describe('showUpdateNotification', () => {
    it('writes update info to stderr', () => {
      const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
      showUpdateNotification({
        current: '1.0.0',
        latest: '2.0.0',
        isOutdated: true,
      })
      expect(writeSpy).toHaveBeenCalled()
      const output = writeSpy.mock.calls[0][0] as string
      expect(output).toContain('1.0.0')
      expect(output).toContain('2.0.0')
      writeSpy.mockRestore()
    })
  })
})
