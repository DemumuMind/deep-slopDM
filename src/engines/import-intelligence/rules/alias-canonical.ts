// ── Alias Canonical Rule ─────────────────────────────────────────────────────
// Suggests replacing relative paths with a matching tsconfig path alias.

import { relative, resolve } from 'node:path'
import type { Diagnostic } from '../../../types/index.js'
import { diag, escapeRegex, type ParsedImport, type TsConfigPaths } from '../shared.js'

export function detectAliasCanonical(
  parsed: ParsedImport,
  filePath: string,
  paths: TsConfigPaths | undefined,
  rootDir: string,
  baseUrl: string | undefined,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  if (!paths || Object.keys(paths).length === 0) return diagnostics
  if (!parsed.source.startsWith('.')) return diagnostics

  const absoluteSource = resolve(filePath, '..', parsed.source)
  const relativeToRoot = relative(rootDir, absoluteSource)
  const sourcePath = relativeToRoot.replace(/\\/g, '/').replace(/\.tsx?$/, '')

  for (const alias of Object.keys(paths)) {
    const targetPattern = paths[alias][0]?.replace(/\*/g, '(.+)')
    if (!targetPattern) continue
    const targetPatternNoPrefix = targetPattern.replace(/^\./, '')
    const regex = new RegExp('^' + escapeRegex(targetPatternNoPrefix).replace(/\\\(\./g, '(.+)').replace(/\\\.\+/g, '(.+)') + '$')
    const match = sourcePath.match(regex)
    if (match) {
      const aliasWithCapture = alias.replace(/\*$/, match[1] ?? '')
      const replacement = parsed.raw.replace(
        new RegExp(`['"]${escapeRegex(parsed.source)}['"]`),
        `'${aliasWithCapture}'`,
      )

      diagnostics.push(
        diag(filePath, 'import-intelligence/alias-canonical', 'suggestion',
          `Prefer tsconfig alias '${aliasWithCapture}' over relative path '${parsed.source}'`,
          parsed.line,
          'Using project aliases improves maintainability and reduces churn when files move.',
          {
            fixable: true,
            suggestion: {
              type: 'replace',
              text: replacement,
              range: {
                startLine: parsed.line,
                startCol: 1,
                endLine: parsed.line,
                endCol: parsed.raw.length + 1,
              },
              confidence: parsed.viaAST ? 0.82 : 0.75,
              reason: 'Project aliases are designed for internal modules. Relative paths are brittle when files move; using the alias keeps imports stable and signals that the target is an internal project module.',
            },
            detail: {
              astConfirmed: parsed.viaAST,
              alias: aliasWithCapture,
            },
          },
        ),
      )
      break
    }
  }

  return diagnostics
}
