import type { Engine, EngineContext, EngineResult, Diagnostic } from '../../types/index.js'
import { runRuff, ruffAvailable } from './python.js'
import { runGolangciLint, golangciAvailable } from './go.js'
import { runClippy, clippyAvailable } from './rust.js'

/** Lint-external engine: runs external linters (ruff, golangci-lint, clippy) */
export const lintExternalEngine: Engine = {
  name: 'lint-external' as const,
  description:
    'External linter integration: runs ruff (Python), golangci-lint (Go), and clippy (Rust) when available',
  supportedLanguages: ['python', 'go', 'rust'],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now()
    const diagnostics: Diagnostic[] = []
    const languages = context.languages
    const skipReasons: string[] = []
    let anyLinterRan = false

    // Python: ruff
    if (languages.includes('python')) {
      if (ruffAvailable()) {
        const ruffDiags = runRuff(context)
        diagnostics.push(...ruffDiags)
        anyLinterRan = true
      } else {
        skipReasons.push('python: ruff not installed')
      }
    }

    // Go: golangci-lint
    if (languages.includes('go')) {
      if (golangciAvailable()) {
        const goDiags = runGolangciLint(context)
        diagnostics.push(...goDiags)
        anyLinterRan = true
      } else {
        skipReasons.push('go: golangci-lint not installed')
      }
    }

    // Rust: cargo clippy
    if (languages.includes('rust')) {
      if (clippyAvailable()) {
        const rustDiags = runClippy(context)
        diagnostics.push(...rustDiags)
        anyLinterRan = true
      } else {
        skipReasons.push('rust: cargo/clippy not installed')
      }
    }

    // If no relevant languages were detected at all
    const hasRelevantLang = languages.some((l) => ['python', 'go', 'rust'].includes(l))
    if (!hasRelevantLang) {
      return {
        engine: this.name,
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: 'No Python, Go, or Rust detected in project',
      }
    }

    // If relevant languages exist but no linters were available
    if (!anyLinterRan) {
      return {
        engine: this.name,
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: `No external linters available (${skipReasons.join('; ')})`,
      }
    }

    return {
      engine: this.name,
      diagnostics,
      elapsed: performance.now() - start,
      skipped: false,
    }
  },
}

