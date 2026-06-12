import { readdir, readFile, stat } from 'node:fs/promises'
import { join, extname, relative } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { minimatch } from 'minimatch'
import type { Language, Framework } from '../types/index.js'
import type { CoverageInfo } from './coverage-gate.js'
import { assessCoverage } from './coverage-gate.js'

/** File extension → language mapping */
const EXT_MAP: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.java': 'java',
}

/** Detect languages from file extensions in the project */
export async function detectLanguages(rootDir: string): Promise<Language[]> {
  const langCounts = new Map<Language, number>()
  await walkDir(rootDir, async (filePath) => {
    const ext = extname(filePath)
    const lang = EXT_MAP[ext]
    if (lang) {
      langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1)
    }
  }, undefined)
  return [...langCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang)
}

/** Detect frameworks from config files and dependencies */
export async function detectFrameworks(rootDir: string): Promise<Framework[]> {
  const frameworks: Framework[] = []

  // Check package.json for JS frameworks
  try {
    const pkgPath = join(rootDir, 'package.json')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'))
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }

    if (allDeps['next']) frameworks.push('next.js')
    if (allDeps['react']) frameworks.push('react')
    if (allDeps['vue'] || allDeps['@vue/compiler-sfc']) frameworks.push('vue')
    if (allDeps['svelte'] || allDeps['@sveltejs/kit']) frameworks.push('svelte')
    if (allDeps['@angular/core']) frameworks.push('angular')
    if (allDeps['express']) frameworks.push('express')
    if (allDeps['fastify']) frameworks.push('fastify')
    if (allDeps['@nestjs/core']) frameworks.push('nestjs')
  } catch { /* no package.json */ }

  // Check Python frameworks
  try {
    const reqPath = join(rootDir, 'requirements.txt')
    const req = await readFile(reqPath, 'utf-8')
    if (req.includes('django')) frameworks.push('django')
    if (req.includes('flask')) frameworks.push('flask')
    if (req.includes('fastapi')) frameworks.push('fastapi')
  } catch { /* no requirements.txt */ }

  // Check Ruby frameworks
  try {
    const gemPath = join(rootDir, 'Gemfile')
    const gem = await readFile(gemPath, 'utf-8')
    if (gem.includes('rails')) frameworks.push('rails')
  } catch { /* no Gemfile */ }

  // Check PHP frameworks
  try {
    const compPath = join(rootDir, 'composer.json')
    const comp = JSON.parse(await readFile(compPath, 'utf-8'))
    if (comp.require?.['laravel/framework']) frameworks.push('laravel')
  } catch { /* no composer.json */ }

  if (frameworks.length === 0) frameworks.push('none')
  return frameworks
}

/**
 * Load .deep-slopignore patterns from the project root.
 * Returns an array of glob patterns (lines that are not empty or comments).
 */
export function loadDeepSlopIgnore(rootDir: string): string[] {
  const ignorePath = join(rootDir, '.deep-slopignore')
  if (!existsSync(ignorePath)) return []

  try {
    const content = readFileSync(ignorePath, 'utf-8')
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'))
  } catch {
    return []
  }
}

/**
 * Check if a relative file path matches any ignore pattern using minimatch.
 * Supports gitignore-style glob patterns.
 */
function matchesIgnorePattern(relPath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Negation patterns (prefixed with !) are not supported here
    if (pattern.startsWith('!')) continue
    if (minimatch(relPath, pattern, { dot: true })) return true
    // Also try matching with the pattern treating basename-only patterns
    if (!pattern.includes('/')) {
      const basename = relPath.split('/').pop() ?? ''
      if (minimatch(basename, pattern, { dot: true })) return true
    }
  }
  return false
}

/** Collect all source files to scan */
export async function collectFiles(
  rootDir: string,
  languages: Language[],
  excludePatterns: string[] = [],
  includeFiles?: string[],
  ignorePatterns?: string[],
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
      files.push(filePath)
    }
  }, excludeSet)

  return files
}

/** Check if path matches any exclude pattern */
function isExcluded(relPath: string, excludes: Set<string>): boolean {
  const segments = relPath.split('/')
  for (const pattern of excludes) {
    if (relPath.includes(pattern) || segments.some((s) => s === pattern)) {
      return true
    }
  }
  return false
}

/** Directories to always skip during walk (never recurse into) */
const SKIP_DIR_NAMES = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '.pnpm-store', '.turbo', '.vercel', '.cache', 'tmp-', '__pycache__',
  '.venv', 'venv', '.tox', 'target', 'vendor', 'bower_components',
])

/** Walk directory recursively, skipping excluded directories early */
async function walkDir(
  dir: string,
  visitor: (filePath: string) => Promise<void>,
  excludeSet?: Set<string>,
): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Skip excluded directories by name — don't recurse into them at all
        if (SKIP_DIR_NAMES.has(entry.name)) continue
        if (excludeSet && excludeSet.has(entry.name)) continue
        const fullPath = join(dir, entry.name)
        await walkDir(fullPath, visitor, excludeSet)
      } else if (entry.isFile()) {
        const fullPath = join(dir, entry.name)
        await visitor(fullPath)
      }
    }
  } catch { /* permission denied, skip */ }
}

// ── Discovery Enhancements ──────────────────────────────

/** Detect the package manager used by the project */
export async function detectPackageManager(
  rootDir: string,
): Promise<'npm' | 'pnpm' | 'yarn' | 'bun' | null> {
  // Check for lock files first (most reliable)
  if (existsSync(join(rootDir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(rootDir, 'bun.lockb')) || existsSync(join(rootDir, 'bun.lock'))) return 'bun'
  if (existsSync(join(rootDir, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(rootDir, 'package-lock.json'))) return 'npm'

  // Check packageManager field in package.json
  try {
    const pkgPath = join(rootDir, 'package.json')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'))
    if (pkg.packageManager) {
      const pm = String(pkg.packageManager)
      if (pm.startsWith('pnpm')) return 'pnpm'
      if (pm.startsWith('yarn')) return 'yarn'
      if (pm.startsWith('bun')) return 'bun'
      if (pm.startsWith('npm')) return 'npm'
    }
  } catch { /* no package.json */ }

  return null
}

/** Detect installed linters */
export async function detectInstalledLinters(rootDir: string): Promise<string[]> {
  const linters: string[] = []

  // Check JS/TS linters from package.json
  try {
    const pkgPath = join(rootDir, 'package.json')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'))
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }

    if (allDeps['eslint']) linters.push('eslint')
    if (allDeps['biome'] || allDeps['@biomejs/biome']) linters.push('biome')
    if (allDeps['prettier']) linters.push('prettier')
    if (allDeps['tslint']) linters.push('tslint')
    if (allDeps['jshint']) linters.push('jshint')
    if (allDeps['stylelint']) linters.push('stylelint')
    if (allDeps['@typescript-eslint/eslint-plugin']) linters.push('typescript-eslint')
  } catch { /* no package.json */ }

  // Check for ESLint config files
  const eslintConfigs = ['.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc']
  for (const cfg of eslintConfigs) {
    if (existsSync(join(rootDir, cfg))) {
      if (!linters.includes('eslint')) linters.push('eslint')
      break
    }
  }
  // Check for flat config
  if (existsSync(join(rootDir, 'eslint.config.js')) || existsSync(join(rootDir, 'eslint.config.mjs'))) {
    if (!linters.includes('eslint')) linters.push('eslint')
  }

  // Check for Biome config
  if (existsSync(join(rootDir, 'biome.json'))) {
    if (!linters.includes('biome')) linters.push('biome')
  }

  // Check Python linters
  try {
    const reqPath = join(rootDir, 'requirements.txt')
    const req = await readFile(reqPath, 'utf-8')
    if (req.includes('ruff')) linters.push('ruff')
    if (req.includes('pylint')) linters.push('pylint')
    if (req.includes('flake8')) linters.push('flake8')
    if (req.includes('mypy')) linters.push('mypy')
  } catch { /* no requirements.txt */ }

  // Check for pyproject.toml linters
  try {
    const pyprojPath = join(rootDir, 'pyproject.toml')
    const pyproj = await readFile(pyprojPath, 'utf-8')
    if (pyproj.includes('ruff')) linters.push('ruff')
    if (pyproj.includes('pylint')) linters.push('pylint')
    if (pyproj.includes('flake8')) linters.push('flake8')
    if (pyproj.includes('mypy')) linters.push('mypy')
  } catch { /* no pyproject.toml */ }

  // Check Go linters
  if (existsSync(join(rootDir, 'go.mod'))) {
    try {
      const { execSync } = await import('node:child_process')
      execSync('which golangci-lint', { stdio: 'pipe', timeout: 3000 })
      linters.push('golangci-lint')
    } catch { /* not installed */ }
  }

  // Check Rust linters
  if (existsSync(join(rootDir, 'Cargo.toml'))) {
    try {
      const { execSync } = await import('node:child_process')
      execSync('which clippy', { stdio: 'pipe', timeout: 3000 })
      linters.push('clippy')
    } catch { /* not installed */ }
  }

  // Check for .golangci.yml / .golangci.yaml
  if (existsSync(join(rootDir, '.golangci.yml')) || existsSync(join(rootDir, '.golangci.yaml'))) {
    if (!linters.includes('golangci-lint')) linters.push('golangci-lint')
  }

  return linters
}

/** Detect test frameworks */
export async function detectTestFramework(rootDir: string): Promise<string[]> {
  const frameworks: string[] = []

  // Check JS/TS test frameworks from package.json
  try {
    const pkgPath = join(rootDir, 'package.json')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'))
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }

    if (allDeps['jest']) frameworks.push('jest')
    if (allDeps['vitest']) frameworks.push('vitest')
    if (allDeps['mocha']) frameworks.push('mocha')
    if (allDeps['jasmine']) frameworks.push('jasmine')
    if (allDeps['@playwright/test']) frameworks.push('playwright')
    if (allDeps['cypress']) frameworks.push('cypress')
    if (allDeps['ava']) frameworks.push('ava')
    if (allDeps['tape']) frameworks.push('tape')
    if (allDeps['@testing-library/react']) frameworks.push('testing-library')
    if (allDeps['karma']) frameworks.push('karma')
  } catch { /* no package.json */ }

  // Check for test config files
  const testConfigs = [
    { file: 'jest.config.js', name: 'jest' },
    { file: 'jest.config.ts', name: 'jest' },
    { file: 'vitest.config.ts', name: 'vitest' },
    { file: 'vitest.config.js', name: 'vitest' },
    { file: 'playwright.config.ts', name: 'playwright' },
    { file: 'playwright.config.js', name: 'playwright' },
    { file: 'cypress.config.ts', name: 'cypress' },
    { file: 'cypress.config.js', name: 'cypress' },
  ]
  for (const cfg of testConfigs) {
    if (existsSync(join(rootDir, cfg.file))) {
      if (!frameworks.includes(cfg.name)) frameworks.push(cfg.name)
    }
  }

  // Check Python test frameworks
  try {
    const reqPath = join(rootDir, 'requirements.txt')
    const req = await readFile(reqPath, 'utf-8')
    if (req.includes('pytest')) frameworks.push('pytest')
    if (req.includes('unittest')) frameworks.push('unittest')
    if (req.includes('nose')) frameworks.push('nose')
  } catch { /* no requirements.txt */ }

  // Check pyproject.toml for test frameworks
  try {
    const pyprojPath = join(rootDir, 'pyproject.toml')
    const pyproj = await readFile(pyprojPath, 'utf-8')
    if (pyproj.includes('pytest')) frameworks.push('pytest')
  } catch { /* no pyproject.toml */ }

  // Check Go test framework
  if (existsSync(join(rootDir, 'go.mod'))) {
    frameworks.push('go-test')
  }

  // Check Rust test framework
  if (existsSync(join(rootDir, 'Cargo.toml'))) {
    frameworks.push('cargo-test')
  }

  return frameworks
}

/** Detect CI systems */
export async function detectCI(rootDir: string): Promise<string[]> {
  const systems: string[] = []

  // GitHub Actions
  if (existsSync(join(rootDir, '.github', 'workflows'))) {
    systems.push('github-actions')
  }

  // GitLab CI
  if (existsSync(join(rootDir, '.gitlab-ci.yml'))) {
    systems.push('gitlab-ci')
  }

  // Jenkins
  if (existsSync(join(rootDir, 'Jenkinsfile'))) {
    systems.push('jenkins')
  }

  // CircleCI
  if (existsSync(join(rootDir, '.circleci', 'config.yml'))) {
    systems.push('circleci')
  }

  // Travis CI
  if (existsSync(join(rootDir, '.travis.yml'))) {
    systems.push('travis-ci')
  }

  // Azure Pipelines
  if (existsSync(join(rootDir, 'azure-pipelines.yml')) || existsSync(join(rootDir, '.azure-pipelines.yml'))) {
    systems.push('azure-pipelines')
  }

  // Bitbucket Pipelines
  if (existsSync(join(rootDir, 'bitbucket-pipelines.yml'))) {
    systems.push('bitbucket-pipelines')
  }

  // Buildkite
  if (existsSync(join(rootDir, '.buildkite', 'pipeline.yml'))) {
    systems.push('buildkite')
  }

  // Drone CI
  if (existsSync(join(rootDir, '.drone.yml'))) {
    systems.push('drone')
  }

  // Check for deep-slop CI integration
  if (systems.length > 0) {
    try {
      const ghWorkflows = join(rootDir, '.github', 'workflows')
      if (existsSync(ghWorkflows)) {
        const entries = await readdir(ghWorkflows)
        for (const entry of entries) {
          try {
            const content = await readFile(join(ghWorkflows, entry), 'utf-8')
            if (content.includes('deep-slop')) {
              systems.push('deep-slop-ci')
              break
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }

  return systems
}

/** Compute coverage info for the project */
export function computeCoverage(
  languages: Language[],
  totalFiles: number,
): CoverageInfo {
  return assessCoverage(languages, totalFiles)
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
