import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { Engine, EngineContext, EngineResult, Diagnostic } from '../../types/index.js'

const execFileAsync = promisify(execFile)

const KNIPTIMEOUT_MS = 30_000

/** Check if knip is available — try resolving first, fall back to npx version check */
async function isKnipInstalled(): Promise<boolean> {
  // Fast path: check if knip is resolvable locally (no subprocess)
  try {
    require.resolve('knip/package.json')
    return true
  } catch {}
  // Slow fallback: npx --version (5s timeout instead of 15s)
  try {
    await execFileAsync('npx', ['knip', '--version'], {
      timeout: 5_000,
    } as any)
    return true
  } catch {
    return false
  }
}

/** Run knip with JSON reporter and return parsed output */
async function runKnip(rootDir: string): Promise<KnipJsonOutput | null> {
  try {
    const { stdout } = await execFileAsync(
      'npx',
      ['knip', '--reporter', 'json', '--no-progress'],
      {
        timeout: KNIPTIMEOUT_MS,
        cwd: rootDir,
      } as any,
    )
    if (!String(stdout).trim()) return null
    return JSON.parse(String(stdout)) as KnipJsonOutput
  } catch {
    return null
  }
}

/** Knip JSON output shape (simplified) */
interface KnipJsonOutput {
  files?: Record<string, string[]>
  dependencies?: Record<string, string[]>
  exports?: Record<string, string[]>
  types?: Record<string, string[]>
  classMembers?: Record<string, string[]>
  enumMembers?: Record<string, string[]>
}

/** Map a knip section to diagnostics */
function mapKnipSection(
  section: Record<string, string[]> | undefined,
  rulePrefix: string,
  messageLabel: string,
): Diagnostic[] {
  if (!section) return []
  const diagnostics: Diagnostic[] = []

  for (const [filePath, symbols] of Object.entries(section)) {
    for (const symbol of symbols) {
      diagnostics.push({
        filePath,
        engine: 'knip',
        rule: `knip/${rulePrefix}`,
        severity: 'warning',
        message: `${messageLabel}: ${symbol}`,
        help: `Remove the unused ${messageLabel.toLowerCase()} \`${symbol}\` or re-export it if it is part of the public API`,
        line: 1,
        column: 1,
        category: 'dead-code',
        fixable: true,
        detail: { symbol, type: rulePrefix },
      })
    }
  }

  return diagnostics
}

export const knipEngine: Engine = {
  name: 'knip',
  description:
    'Runs knip to detect unused files, dependencies, exports, and types in TypeScript/JavaScript projects',
  supportedLanguages: ['typescript', 'javascript'],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = Date.now()

    // Knip requires a TypeScript / Node project manifest
    const hasTsconfig = existsSync(join(context.rootDirectory, 'tsconfig.json'))
    const hasPackageJson = existsSync(join(context.rootDirectory, 'package.json'))
    if (!hasTsconfig && !hasPackageJson) {
      return {
        engine: 'knip',
        diagnostics: [],
        elapsed: Date.now() - start,
        skipped: true,
        skipReason: 'No tsconfig.json or package.json found; knip analysis skipped',
      }
    }

    // Check if knip is installed
    const installed = await isKnipInstalled()
    if (!installed) {
      return {
        engine: 'knip',
        diagnostics: [],
        elapsed: Date.now() - start,
        skipped: true,
        skipReason: 'knip is not installed. Install with: npm i -D knip',
      }
    }

    // Run knip
    const output = await runKnip(context.rootDirectory)
    if (!output) {
      return {
        engine: 'knip',
        diagnostics: [],
        elapsed: Date.now() - start,
        skipped: false,
      }
    }

    const diagnostics: Diagnostic[] = [
      ...mapKnipSection(output.files, 'unused-file', 'Unused file'),
      ...mapKnipSection(output.dependencies, 'unused-dependency', 'Unused dependency'),
      ...mapKnipSection(output.exports, 'unused-export', 'Unused export'),
      ...mapKnipSection(output.types, 'unused-type', 'Unused type'),
      ...mapKnipSection(output.classMembers, 'unused-class-member', 'Unused class member'),
      ...mapKnipSection(output.enumMembers, 'unused-enum-member', 'Unused enum member'),
    ]

    return {
      engine: 'knip',
      diagnostics,
      elapsed: Date.now() - start,
      skipped: false,
    }
  },
}

