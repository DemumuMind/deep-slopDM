// ── Broken Alias Rule ─────────────────────────────────────────────────────
// Flags tsconfig path aliases that resolve to non-existent files.

import type { Diagnostic } from '../../../types/index.js'
import {
  diag,
  fileExists,
  resolveAliasPath,
  type ParsedImport,
  type TsConfigPaths,
} from '../shared.js'

export async function detectBrokenAlias(
  parsed: ParsedImport,
  filePath: string,
  paths: TsConfigPaths | undefined,
  baseUrl: string | undefined,
  rootDir: string,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = []
  if (!paths || Object.keys(paths).length === 0) return diagnostics

  const aliasResult = resolveAliasPath(parsed.source, paths, baseUrl ?? '.', rootDir)
  if (!aliasResult) return diagnostics

  const resolvedPath = aliasResult.resolvedPattern
  let found = false
  for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js']) {
    if (await fileExists(resolvedPath + ext)) {
      found = true
      break
    }
  }

  if (!found) {
    diagnostics.push(
      diag(filePath, 'import-intelligence/broken-alias', 'error',
        `Alias '${aliasResult.alias}' resolves to '${resolvedPath}' which does not exist`,
        parsed.line,
        'Fix the tsconfig paths mapping or the import path.',
        {
          fixable: false,
          suggestion: {
            type: 'replace',
            text: `/* TODO: fix alias — ${parsed.source} resolves to non-existent ${resolvedPath} */`,
            confidence: parsed.viaAST ? 0.95 : 0.9,
            reason: `The tsconfig paths alias '${aliasResult.alias}' maps to '${resolvedPath}', but no file exists at that location. This will cause a TypeScript compilation error or runtime module-not-found.`,
          },
          detail: {
            alias: aliasResult.alias,
            resolvedPath,
            originalImport: parsed.source,
            astConfirmed: parsed.viaAST,
          },
        },
      ),
    )
  }

  return diagnostics
}
