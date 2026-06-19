import { readdir } from 'node:fs/promises'
import { join, extname } from 'node:path'

/** Recursively collect files under root whose extension is in the given set */
export async function collectFilesByExtension(
  root: string,
  extensions: Set<string>,
  exclude: string[] = [],
): Promise<string[]> {
  const results: string[] = []

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (exclude.some((pat) => full.includes(pat))) continue
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && extensions.has(extname(full).toLowerCase())) {
        results.push(full)
      }
    }
  }

  await walk(root)
  return results
}
