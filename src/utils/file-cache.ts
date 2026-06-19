import { readFile, stat } from 'node:fs/promises'

/** Cached file entry: content and pre-split lines */
interface FileEntry {
  content: string
  lines: { num: number; text: string }[]
  mtimeMs: number
}

/** In-memory file content cache — avoids re-reading the same file across engines */
const cache = new Map<string, FileEntry>()

/** Read file with caching. Checks mtime to invalidate stale entries. */
export async function readFileCached(filePath: string): Promise<string> {
  const cached = cache.get(filePath)
  try {
    const { mtimeMs } = await stat(filePath)
    if (cached && cached.mtimeMs === mtimeMs) {
      return cached.content
    }
    let content = (await readFile(filePath)).toString('utf-8')
    // Strip BOM
    if (content.charCodeAt(0) === 0xfeff) {
      content = content.slice(1)
    }
    const lines = content.split('\n').map((text, i) => ({ num: i + 1, text }))
    cache.set(filePath, { content, lines, mtimeMs })
    return content
  } catch {
    // Fall back to cached content if stat/read fails mid-scan
    if (cached) return cached.content
    throw new Error(`Unable to read file: ${filePath}`)
  }
}

/** Get cached line map for a file. Loads the file if not cached. */
export async function toLinesCached(filePath: string): Promise<{ num: number; text: string }[]> {
  const cached = cache.get(filePath)
  if (cached) return cached.lines
  await readFileCached(filePath)
  return cache.get(filePath)?.lines ?? []
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
