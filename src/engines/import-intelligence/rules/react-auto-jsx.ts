// ── React Auto JSX Rule ────────────────────────────
// Flags unnecessary default React import when using the automatic JSX runtime.

import type { Diagnostic } from '../../../types/index.js'
import { diag, REACT_AUTOMATIC_JSX_VERSION, type ParsedImport } from '../shared.js'

export function detectReactAutoJsx(
  parsed: ParsedImport,
  filePath: string,
  isReactAutoJsx: boolean,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  if (!isReactAutoJsx || parsed.source !== 'react') return diagnostics

  if (parsed.isDefault && parsed.symbols.length === 1 && parsed.symbols[0] === 'React') {
    diagnostics.push(
      diag(filePath, 'import-intelligence/react-auto-jsx', 'suggestion',
        'Default React import is unnecessary with automatic JSX runtime',
        parsed.line,
        'Remove the default React import or switch to named imports (hooks, etc.) if you use them.',
        {
          fixable: true,
          suggestion: {
            type: 'delete',
            text: '',
            range: {
              startLine: parsed.line,
              startCol: 1,
              endLine: parsed.line,
              endCol: parsed.raw.length + 1,
            },
            confidence: parsed.viaAST ? 0.85 : 0.8,
            reason: `With React ${REACT_AUTOMATIC_JSX_VERSION}+ automatic JSX runtime (jsx: 'react-jsx' in tsconfig), 'import React' is not needed for JSX transforms. Removing it reduces unused imports.`,
          },
          detail: { astConfirmed: parsed.viaAST },
        },
      ),
    )
  }

  return diagnostics
}
