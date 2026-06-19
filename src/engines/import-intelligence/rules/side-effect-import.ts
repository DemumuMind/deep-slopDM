// ── Side-Effect Import Rule ──────────────────────────
// Flags side-effect-only imports that may be accidental leftovers.

import type { Diagnostic } from '../../../types/index.js'
import { basename } from 'node:path'
import { diag, type ParsedImport } from '../shared.js'

export function detectSideEffectImport(
  parsed: ParsedImport,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  if (!parsed.isSideEffect) return diagnostics

  const base = basename(filePath)
  // CLI entry/bundle files intentionally import side-effect modules for setup
  if (/cli[-.].*entry|bundle[-.]entry|.*[-.]entry\.tsx?$/.test(base)) return diagnostics

  diagnostics.push(
    diag(filePath, 'import-intelligence/side-effect-import', 'info',
      `Side-effect import: '${parsed.source}' (no bindings imported)`,
      parsed.line,
      'Ensure this import is needed for its side effects (polyfills, CSS, etc.). Remove if unnecessary.',
      {
        suggestion: {
          type: 'delete',
          text: '',
          confidence: 0.3,
          reason: 'Side-effect imports (\'import foo\') load a module for its side effects only. This is correct for polyfills, CSS, and global setup, but can be an accidental leftover if the module was expected to provide bindings.',
        },
        detail: { astConfirmed: parsed.viaAST },
      },
    ),
  )

  return diagnostics
}
