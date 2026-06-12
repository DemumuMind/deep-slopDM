// ── File Watcher with Debouncing ───────────────────────
// Uses Node.js fs.watch with recursive:true + manual debouncing

import { watch, type FSWatcher } from 'node:fs'
import { resolve, relative, join } from 'node:path'

export interface WatchOptions {
  /** Polling interval in ms (default 3000) */
  interval?: number
  /** Debounce window in ms (default 2000) */
  debounce?: number
  /** Paths to exclude (default: node_modules, .git, dist) */
  exclude?: string[]
  /** Callback when debounced changes are ready */
  onChange: (changedFiles: string[]) => void
  /** Optional stats callback */
  onStats?: (stats: WatchStats) => void
}

export interface WatchStats {
  /** Number of file changes accumulated since last scan */
  changesSinceLastScan: number
  /** Timestamp of last scan completion */
  lastScanTime: number | null
  /** Score from last scan */
  lastScanScore: number | null
  /** Total scan cycles completed */
  totalScans: number
  /** Whether a scan is currently in progress */
  isScanning: boolean
}

export interface Watcher {
  /** Start watching the directory */
  start(): void
  /** Stop watching and clean up */
  stop(): void
  /** Get current watch statistics */
  getStats(): WatchStats
}

const DEFAULT_EXCLUDE = ['node_modules', '.git', 'dist']

export function watchDirectory(rootDir: string, options: WatchOptions): Watcher {
  const debounceMs = options.debounce ?? 2000
  const excludePatterns = options.exclude ?? DEFAULT_EXCLUDE

  let fsWatcher: FSWatcher | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let changedFiles: Set<string> = new Set()

  const stats: WatchStats = {
    changesSinceLastScan: 0,
    lastScanTime: null,
    lastScanScore: null,
    totalScans: 0,
    isScanning: false,
  }

  function isExcluded(filePath: string): boolean {
    const relPath = relative(rootDir, filePath)
    for (const pattern of excludePatterns) {
      if (relPath.includes(pattern) || filePath.includes(pattern)) {
        return true
      }
    }
    return false
  }

  function handleChange(eventName: string, filename: string | null): void {
    if (!filename) return

    const fullPath = resolve(rootDir, filename)

    if (isExcluded(fullPath)) return

    changedFiles.add(fullPath)
    stats.changesSinceLastScan = changedFiles.size
    options.onStats?.(stats)

    // Reset debounce timer on each event
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null
      const files = [...changedFiles]
      changedFiles = new Set()
      stats.changesSinceLastScan = 0

      if (files.length > 0) {
        options.onChange(files)
      }
    }, debounceMs)
  }

  return {
    start(): void {
      fsWatcher = watch(rootDir, { recursive: true }, handleChange)

      fsWatcher.on('error', (err: Error) => {
        // Swallow errors from deleted directories, etc.
        if (err.message?.includes('ENOENT') || err.message?.includes('EPERM')) {
          return
        }
        throw err
      })
    },

    stop(): void {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      if (fsWatcher) {
        fsWatcher.close()
        fsWatcher = null
      }
      changedFiles.clear()
      stats.changesSinceLastScan = 0
      stats.isScanning = false
      options.onStats?.(stats)
    },

    getStats(): WatchStats {
      return { ...stats }
    },
  }
}
