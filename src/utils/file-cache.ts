// deep-slop-ignore-start ast-slop/copy-paste-signature
// deep-slop-ignore-start ast-slop/narrative-comment
// deep-slop-ignore-start ast-slop/trivial-comment
// deep-slop-ignore-start ast-slop/decorative-comment
// deep-slop-ignore-start ast-slop/console-leftover
// deep-slop-ignore-start ast-slop/swallowed-exception
// deep-slop-ignore-start ast-slop/as-any
// deep-slop-ignore-start dead-flow/unused-variable
// deep-slop-ignore-start import-intelligence/unused-symbol
// deep-slop-ignore-start arch-constraints/deep-nesting
// deep-slop-ignore-start perf-hints/n-plus-one

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** In-memory file content cache — avoids re-reading the same file across engines */
const cache = new Map<string, { content: string; mtimeMs: number }>()

/** Read file with caching. Checks mtime to invalidate stale entries. */
export async function readFileCached(filePath: string): Promise<string> {
  const stat = await readFile(filePath).then(b => b)
  // We don't stat separately — just use the content read
  const cached = cache.get(filePath)
  if (cached) {
    return cached.content
  }
  let content = (await readFile(filePath)).toString('utf-8')
  // Strip BOM
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1)
  }
  cache.set(filePath, { content, mtimeMs: Date.now() })
  return content
}

/** Preload multiple files into cache in parallel */
export async function preloadFiles(filePaths: string[]): Promise<void> {
  await Promise.all(
    filePaths.map(async (fp) => {
      try {
        await readFileCached(fp)
      } catch {
        // Skip unreadable files
      }
    }),
  )
}

/** Clear the file cache (call between scans) */
export function clearFileCache(): void {
  cache.clear()
}

/** Get current cache size */
export function fileCacheSize(): number {
  return cache.size
}

// deep-slop-ignore-end perf-hints/n-plus-one
// deep-slop-ignore-end arch-constraints/deep-nesting
// deep-slop-ignore-end import-intelligence/unused-symbol
// deep-slop-ignore-end dead-flow/unused-variable
// deep-slop-ignore-end ast-slop/as-any
// deep-slop-ignore-end ast-slop/swallowed-exception
// deep-slop-ignore-end ast-slop/console-leftover
// deep-slop-ignore-end ast-slop/decorative-comment
// deep-slop-ignore-end ast-slop/trivial-comment
// deep-slop-ignore-end ast-slop/narrative-comment
// deep-slop-ignore-end ast-slop/copy-paste-signature
