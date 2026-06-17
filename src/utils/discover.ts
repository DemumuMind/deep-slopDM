import { join, extname, relative } from 'node:path'
import { minimatch } from 'minimatch'
import type { Language, Framework } from '../types/index.js'
import type { CoverageInfo } from './coverage-gate.js'
import {
  EXT_MAP,
  loadDeepSlopIgnore,
  matchesIgnorePattern,
  isExcluded,
  walkDir,
  computeCoverage,
} from './discover/helpers.js'
import {
  detectLanguages,
  detectFrameworks,
  detectPackageManager,
  detectInstalledLinters,
  detectTestFramework,
  detectCI,
} from './discover/detectors.js'

// Re-export detection helpers (public API)
export {
  detectLanguages,
  detectFrameworks,
  detectPackageManager,
  detectInstalledLinters,
  detectTestFramework,
  detectCI,
  loadDeepSlopIgnore,
  computeCoverage,
}

/** Comprehensive project information */
export interface ProjectInfo {
  /** Root directory */
  rootDir: string
  /** Detected languages (sorted by file count desc) */
  languages: Language[]
  /** Detected frameworks */
  frameworks: Framework[]
  /** Package manager (npm/pnpm/yarn/bun or null) */
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | null
  /** Installed linters */
  linters: string[]
  /** Test frameworks */
  testFrameworks: string[]
  /** CI systems */
  ci: string[]
  /** Total source file count */
  totalFiles: number
  /** Per-language file counts */
  fileCounts: Record<string, number>
  /** Coverage info for scoreability */
  coverage: CoverageInfo
}

/** Collect all source files to scan */
export async function collectFiles(
  rootDir: string,
  languages: Language[],
  excludePatterns: string[] = [],
  includeFiles?: string[],
  ignorePatterns?: string[],
  includePatterns?: string[],
): Promise<string[]> {
  if (includeFiles) {
    let files = includeFiles.map((f) => (f.startsWith('/') ? f : join(rootDir, f)))
    // Apply ignore patterns even for explicitly included files
    if (ignorePatterns && ignorePatterns.length > 0) {
      files = files.filter((f) => {
        const relPath = relative(rootDir, f)
        return !matchesIgnorePattern(relPath, ignorePatterns)
      })
    }
    return files
  }

  const targetExts = new Set(
    Object.entries(EXT_MAP)
      .filter(([, lang]) => languages.includes(lang))
      .map(([ext]) => ext),
  )

  // Combine .deep-slopignore patterns with any provided ignore patterns
  const deepSlopIgnorePatterns = loadDeepSlopIgnore(rootDir)
  const allIgnorePatterns = [...deepSlopIgnorePatterns, ...(ignorePatterns ?? [])]

  const excludeSet = new Set(excludePatterns)
  const files: string[] = []

  await walkDir(rootDir, async (filePath) => {
    const relPath = relative(rootDir, filePath)
    if (isExcluded(relPath, excludeSet)) return
    // Check .deep-slopignore + config ignore patterns
    if (allIgnorePatterns.length > 0 && matchesIgnorePattern(relPath, allIgnorePatterns)) return
    const ext = extname(filePath)
    if (targetExts.has(ext)) {
      // If --include patterns specified, only keep files matching at least one
      if (includePatterns && includePatterns.length > 0) {
        const matched = includePatterns.some((pat) =>
          minimatch(relPath, pat, { dot: true }) ||
          (!pat.includes('/') && minimatch(filePath.split('/').pop() ?? '', pat, { dot: true }))
        )
        if (!matched) return
      }
      files.push(filePath)
    }
  }, excludeSet)

  return files
}

/** Gather comprehensive project information */
export async function projectInfo(rootDir: string): Promise<ProjectInfo> {
  const languages = await detectLanguages(rootDir)
  const frameworks = await detectFrameworks(rootDir)
  const packageManager = await detectPackageManager(rootDir)
  const linters = await detectInstalledLinters(rootDir)
  const testFrameworks = await detectTestFramework(rootDir)
  const ci = await detectCI(rootDir)

  // Count files per language
  const fileCounts: Record<string, number> = {}
  let totalFiles = 0
  await walkDir(rootDir, async (filePath) => {
    const ext = extname(filePath)
    const lang = EXT_MAP[ext]
    if (lang) {
      fileCounts[lang] = (fileCounts[lang] ?? 0) + 1
      totalFiles++
    }
  }, undefined)

  const coverage = computeCoverage(languages, totalFiles)

  return {
    rootDir,
    languages,
    frameworks,
    packageManager,
    linters,
    testFrameworks,
    ci,
    totalFiles,
    fileCounts,
    coverage,
  }
}
