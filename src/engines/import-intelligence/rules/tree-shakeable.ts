// ── Tree-Shakeable Import Rule ─────────────────────────
// Suggests deep imports for packages that support tree-shakeable symbols.

import type { Diagnostic } from '../../../types/index.js'
import { diag, TREE_SHAKEABLE_PACKAGES, type ParsedImport } from '../shared.js'

export function detectTreeShakeable(
  parsed: ParsedImport,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const pkgName = parsed.source.startsWith('@')
    ? parsed.source.split('/').slice(0, 2).join('/')
    : parsed.source.split('/')[0]

  const template = TREE_SHAKEABLE_PACKAGES[pkgName]
  if (template && parsed.symbols.length > 0 && !parsed.isNamespace) {
    const alternatives = parsed.symbols.map((sym) => {
      const altPath = template.replace('{symbol}', sym)
      return `import ${sym} from '${altPath}'`
    })

    const baseConfidence = parsed.viaAST ? 0.9 : 0.85
    diagnostics.push(
      diag(filePath, 'import-intelligence/tree-shakeable', 'suggestion',
        `Tree-shakeable alternative available for '${pkgName}' import`,
        parsed.line,
        'Replace with deep imports so bundlers can eliminate unused code.',
        {
          fixable: true,
          suggestion: {
            type: 'replace',
            text: alternatives.join('\n'),
            range: {
              startLine: parsed.line,
              startCol: 1,
              endLine: parsed.line,
              endCol: parsed.raw.length + 1,
            },
            confidence: baseConfidence,
            reason: `Deep imports from '${pkgName}' allow bundlers to tree-shake unused modules, reducing bundle size significantly. Named imports from the barrel pull in the entire package.`,
          },
          detail: { astConfirmed: parsed.viaAST },
        },
      ),
    )
  }

  return diagnostics
}
