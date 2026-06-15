// ── Hallucinated Import Rule ────────────────────────
// Detects imports of packages not listed in project dependencies.

import type { Diagnostic, Language } from '../../../types/index.js'
import { extractImports } from '../../../utils/file-utils.js'
import { diag, isBareSpecifier, scopedPackageName, resolveTsconfigAlias, type TsconfigPaths } from '../shared.js'

export function detectHallucinatedImport(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
  knownDeps: Set<string>,
  tsconfigPaths: TsconfigPaths | null,
  rootDir: string,
): Diagnostic[] {
  const results: Diagnostic[] = []
  const imports = extractImports(content, language)

  for (const imp of imports) {
    if (!isBareSpecifier(imp.source)) continue

    if (tsconfigPaths) {
      const resolved = resolveTsconfigAlias(imp.source, tsconfigPaths, rootDir)
      if (resolved) continue
    }

    let pkgName: string
    if (imp.source.startsWith('@')) {
      const scoped = scopedPackageName(imp.source)
      if (!scoped) continue
      pkgName = scoped
    } else {
      pkgName = imp.source.split('/')[0]
    }

    if (!knownDeps.has(pkgName)) {
      const nodeBuiltins = new Set([
        'fs', 'path', 'http', 'https', 'url', 'util', 'crypto', 'os', 'stream',
        'buffer', 'events', 'child_process', 'cluster', 'dns', 'net', 'tls',
        'zlib', 'assert', 'async_hooks', 'perf_hooks',
        'worker_threads', 'readline', 'vm', 'module', 'process', 'timers',
        'dgram', 'fs/promises', 'node:fs', 'node:path', 'node:http',
        'node:https', 'node:url', 'node:util', 'node:crypto', 'node:os',
        'node:stream', 'node:buffer', 'node:events', 'node:child_process',
        'node:fs/promises', 'node:perf_hooks', 'node:assert',
      ])

      const pyBuiltins = new Set([
        'os', 'sys', 'json', 're', 'math', 'datetime', 'collections',
        'functools', 'itertools', 'logging', 'pathlib', 'typing',
        'dataclasses', 'abc', 'io', 'hashlib', 'copy', 'enum',
        'subprocess', 'argparse', 'unittest', 'asyncio', 'threading',
        'multiprocessing', 'http', 'urllib', 'socket', 'struct',
        'csv', 'sqlite3', 'random', 'string', 'textwrap', 'tempfile',
      ])

      const builtins = language === 'python' ? pyBuiltins : nodeBuiltins
      if (builtins.has(pkgName)) continue

      if (pkgName === 'typescript' && imp.isTypeOnly) continue

      const line = lines.find((l) => l.num === imp.line)
      const col = line ? line.text.indexOf(imp.source) + 1 : 1

      results.push(
        diag({
          filePath,
          rule: 'ast-slop/hallucinated-import',
          severity: 'error',
          message: `Import "${imp.source}" not found in project dependencies`,
          help: `Package "${pkgName}" is not listed in package.json/requirements.txt. This may be a hallucinated import. Install it (npm install ${pkgName}) or remove the import if it was incorrectly generated.`,
          line: imp.line,
          column: col,
          fixable: true,
          suggestion: {
            type: 'delete',
            text: '',
            range: { startLine: imp.line, startCol: 1, endLine: imp.line, endCol: (line?.text.length ?? 80) + 1 },
            confidence: 0.8,
            reason: `The imported package "${pkgName}" is not in project dependencies and may not exist.`,
          },
          detail: { importSource: imp.source, packageName: pkgName },
        }),
      )
    }
  }
  return results
}
