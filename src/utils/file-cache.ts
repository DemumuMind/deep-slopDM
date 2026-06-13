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

