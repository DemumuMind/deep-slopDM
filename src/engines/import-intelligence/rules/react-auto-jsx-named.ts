// ── React Auto JSX Named Rule ────────────────────────
// Suggests removing the default React import while keeping named hooks.

import type { Diagnostic } from '../../../types/index.js'
import { diag, type ParsedImport } from '../shared.js'

export function detectReactAutoJsxNamed(
  parsed: ParsedImport,
  filePath: string,
  isReactAutoJsx: boolean,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  if (!isReactAutoJsx || parsed.source !== 'react') return diagnostics

  if (parsed.isDefault && parsed.symbols.length > 1 && parsed.symbols.includes('React')) {
    const namedSymbols = parsed.symbols.filter((s) => s !== 'React')
    const replacement = `import { ${namedSymbols.join(', ')} } from 'react'`

    diagnostics.push(
      diag(filePath, 'import-intelligence/react-auto-jsx-named', 'suggestion',
        'Default React import is unnecessary with automatic JSX runtime; keep named imports only',
        parsed.line,
        'Remove the default React import and keep only the named hooks/utilities.',
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
            confidence: parsed.viaAST ? 0.85 : 0.8,
            reason: 'With automatic JSX runtime, the default \'React\' import is unused. Keeping only named imports is cleaner and avoids pulling in the full React object.',
          },
          detail: { astConfirmed: parsed.viaAST },
        },
      ),
    )
  }

  return diagnostics
}
