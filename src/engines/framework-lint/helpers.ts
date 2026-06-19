import { access, readdir, stat, readFile } from 'node:fs/promises'
import { join, extname, relative } from 'node:path'
import type { Diagnostic } from '../../types/index.js'
import { readFileContent } from '../../utils/file-utils.js'

// ── Helpers ──────────────────────────────────────────────

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Create a framework-lint diagnostic */
export function diag(overrides: Partial<Diagnostic> & Pick<Diagnostic, 'rule' | 'severity' | 'message' | 'filePath'>): Diagnostic {
  return {
    engine: 'framework-lint' as const,
    category: 'style',
    line: 1,
    column: 1,
    fixable: false,
    help: '',
    ...overrides,
  }
}

/** File extensions this engine scans */
export const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css'])

/** Detect if project uses Next.js (from deps or config) */
export async function detectNextJs(rootDir: string): Promise<boolean> {
  try {
    const pkgPath = join(rootDir, 'package.json')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'))
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (allDeps['next']) return true
  } catch { /* no package.json */ }

  const configCandidates = [
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
    'next.config.cjs',
  ]
  for (const name of configCandidates) {
    if (await exists(join(rootDir, name))) return true
  }

  return false
}

/** Detect if project uses Tailwind CSS (from deps or config) */
export async function detectTailwind(rootDir: string): Promise<boolean> {
  try {
    const pkgPath = join(rootDir, 'package.json')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'))
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (allDeps['tailwindcss'] || allDeps['@tailwindcss/postcss'] || allDeps['@tailwindcss/vite']) return true
  } catch { /* no package.json */ }

  const entries = await readdir(rootDir).catch(() => [] as string[])
  const twConfigs = entries.filter((e) => e.startsWith('tailwind.config'))
  if (twConfigs.length > 0) return true

  for (const name of ['postcss.config.js', 'postcss.config.mjs', 'postcss.config.cjs', 'postcss.config.ts']) {
    const fullPath = join(rootDir, name)
    try {
      const content = await readFileContent(fullPath)
      if (content.includes('tailwindcss') || content.includes('@tailwindcss')) return true
    } catch { /* skip */ }
  }

  return false
}

/** Check if App Router project (has app/ directory) */
export async function isAppRouterProject(rootDir: string): Promise<boolean> {
  const appDir = join(rootDir, 'src', 'app')
  const appDirRoot = join(rootDir, 'app')
  try {
    const s = await stat(appDir)
    if (s.isDirectory()) return true
  } catch { /* no src/app */ }
  try {
    const s = await stat(appDirRoot)
    if (s.isDirectory()) return true
  } catch { /* no app */ }
  return false
}

/** Collect all scannable files */
export async function collectScanFiles(rootDir: string): Promise<string[]> {
  const files: string[] = []
  const ignoreDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cache', 'coverage'])

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [] as import('node:fs').Dirent[])
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoreDirs.has(entry.name) && !entry.name.startsWith('.')) {
          await walk(join(dir, entry.name))
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name)
        if (SCAN_EXTENSIONS.has(ext)) {
          files.push(join(dir, entry.name))
        }
      }
    }
  }

  await walk(rootDir)
  return files
}
