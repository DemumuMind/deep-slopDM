import type {
  Engine,
  EngineContext,
  EngineResult,
  Diagnostic,
  FixResult,
} from '../../types/index.js'
import { readFileContent, toLines } from '../../utils/file-utils.js'
import {
  parsePython,
  isPythonAvailable,
} from '../../utils/tree-sitter/index.js'
import { readFile, writeFile } from 'node:fs/promises'
import { ENGINE_NAME, analyzeWithAST } from './rules.js'
import {
  applyFixes,
  isTestFile,
  isPublicName,
  splitParams,
  findFirstBodyLine,
  makeDiagnostic,
  LOGGING_PREFIX_RE,
} from './helpers.js'

function analyzeWithRegex(filePath: string, content: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const lines = toLines(content)
  const isTest = isTestFile(filePath)

  for (let i = 0; i < lines.length; i++) {
    const { num, text } = lines[i]

    // bare-except
    if (/^\s*except\s*:\s*(?:#.*)?$/.test(text)) {
      diagnostics.push(makeDiagnostic(filePath, 'bare-except', num, text.indexOf('except') + 1,
        'Bare except clause catches all exceptions',
        {
          fixable: true,
          suggestion: {
            type: 'replace',
            text: 'except Exception:',
            confidence: 0.95,
            reason: 'Bare except catches KeyboardInterrupt and SystemExit; use a specific exception type.',
          },
        }
      ))
    }

    // broad-exception
    const broadMatch = text.match(/^\s*except\s+(Exception|BaseException)\s*:/)
    if (broadMatch) {
      diagnostics.push(makeDiagnostic(filePath, 'broad-exception', num, text.indexOf('except') + 1,
        `Catching broad exception type '${broadMatch[1]}'`,
        {
          suggestion: {
            type: 'refactor',
            text: 'except SpecificError:',
            confidence: 0.7,
            reason: 'Catching broad exceptions can mask bugs; catch specific types you can handle.',
          },
        }
      ))
    }

    // global
    if (/^\s*global\s+\w+/.test(text)) {
      diagnostics.push(makeDiagnostic(filePath, 'global-variable', num, text.search(/\bglobal\b/) + 1,
        'Use of the global keyword'
      ))
    }

    // star-import
    if (/^\s*from\s+\S+\s+import\s+\*/.test(text)) {
      diagnostics.push(makeDiagnostic(filePath, 'star-import', num, text.search(/\*/) + 1,
        'Wildcard import pollutes the namespace'
      ))
    }

    // print
    if (!isTest && /^\s*print\s*\(/.test(text)) {
      diagnostics.push(makeDiagnostic(filePath, 'print-statement', num, text.search(/\bprint\b/) + 1,
        'print() in non-test code',
        {
          fixable: true,
          suggestion: {
            type: 'delete',
            text: '',
            confidence: 0.9,
            reason: 'Debug print statements should be removed or replaced with logging.',
          },
        }
      ))
    }

    // f-string in log
    if (LOGGING_PREFIX_RE.test(text) && /f['"]/.test(text)) {
      diagnostics.push(makeDiagnostic(filePath, 'f-string-in-log', num, text.search(/\b(logging|logger|log)\b/) + 1,
        'Logging call uses f-string instead of lazy formatting',
        {
          fixable: true,
          suggestion: {
            type: 'replace',
            text: 'logger.info("value %s", value)',
            confidence: 0.7,
            reason: 'Lazy formatting avoids work when the log level filters the message out.',
          },
        }
      ))
    }

    // mutable default
    const defMatch = text.match(/^(\s*)def\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*(?:->\s*\S+\s*)?:\s*(?:#.*)?$/)
    if (defMatch) {
      const indent = defMatch[1]
      const name = defMatch[2]
      const params = splitParams(defMatch[3])
      for (const raw of params) {
        const param = raw.trim()
        if (!param) continue
        const eqIdx = param.indexOf('=')
        const namePart = eqIdx === -1 ? param : param.slice(0, eqIdx).trim()
        const valuePart = eqIdx === -1 ? '' : param.slice(eqIdx + 1).trim()
        const paramName = namePart.split(':')[0].trim()
        if (paramName === 'self' || paramName === 'cls' || paramName.startsWith('*')) continue
        if (valuePart && /^(\[\s*\]|\{\s*\})$/.test(valuePart)) {
          const col = text.indexOf(raw) + 1
          diagnostics.push(makeDiagnostic(filePath, 'mutable-default', num, col > 0 ? col : 1,
            `Parameter '${paramName}' has a mutable default value`,
            {
              fixable: true,
              suggestion: {
                type: 'replace',
                text: `${paramName}=None`,
                confidence: 0.85,
                reason: 'Mutable defaults are shared across calls; use None and initialize inside the function.',
              },
              detail: { paramName, defaultValue: valuePart },
            }
          ))
        }
        if (!param.includes(':')) {
          // no type hint
          const col = text.indexOf(paramName) + 1
          diagnostics.push(makeDiagnostic(filePath, 'no-type-hint', num, col > 0 ? col : 1,
            `Parameter '${paramName}' has no type annotation`,
            {
              suggestion: {
                type: 'replace',
                text: `${paramName}: <type>`,
                confidence: 0.6,
                reason: 'Add a type annotation to improve readability and catch bugs.',
              },
            }
          ))
        }
      }
      // no return type
      if (!text.includes('->')) {
        diagnostics.push(makeDiagnostic(filePath, 'no-return-type', num, text.indexOf('def') + 1,
          `Function '${name}' is missing a return type annotation`,
          {
            suggestion: {
              type: 'insert',
              text: `def ${name}(...) -> None:`,
              confidence: 0.6,
              reason: 'Add a return type annotation to clarify the function contract.',
            },
          }
        ))
      }

      // pass-stub: first body line is pass/ellipsis
      const firstBodyLine = findFirstBodyLine(lines, i, indent)
      if (firstBodyLine && /^\s*(?:pass|\.\.\.)\s*(?:#.*)?$/.test(firstBodyLine.text)) {
        diagnostics.push(makeDiagnostic(filePath, 'pass-stub', num, text.indexOf(name) + 1,
          `Function '${name}' is a stub (only pass/ellipsis)`,
          {
            fixable: true,
            suggestion: {
              type: 'replace',
              text: 'raise NotImplementedError',
              confidence: 0.8,
              reason: 'A stub should raise NotImplementedError or be implemented.',
            },
          }
        ))
      }

      // missing-docstring
      if (isPublicName(name) && firstBodyLine && !/^\s*(?:r|u|b|br|rb)?(?:"""|'''|"|')/.test(firstBodyLine.text)) {
        diagnostics.push(makeDiagnostic(filePath, 'missing-docstring', num, text.indexOf(name) + 1,
          `Public function '${name}' is missing a docstring`
        ))
      }
    }

    // class pass-stub / missing docstring
    const classMatch = text.match(/^(\s*)class\s+([a-zA-Z_]\w*)\s*(?:\([^)]*\))?\s*:\s*(?:#.*)?$/)
    if (classMatch) {
      const indent = classMatch[1]
      const name = classMatch[2]
      const firstBodyLine = findFirstBodyLine(lines, i, indent)
      if (firstBodyLine && /^\s*(?:pass|\.\.\.)\s*(?:#.*)?$/.test(firstBodyLine.text)) {
        diagnostics.push(makeDiagnostic(filePath, 'pass-stub', num, text.indexOf(name) + 1,
          `Class '${name}' is a stub (only pass/ellipsis)`,
          {
            fixable: true,
            suggestion: {
              type: 'replace',
              text: 'raise NotImplementedError',
              confidence: 0.8,
              reason: 'A stub should raise NotImplementedError or be implemented.',
            },
          }
        ))
      }
      if (isPublicName(name) && firstBodyLine && !/^\s*(?:r|u|b|br|rb)?(?:"""|'''|"|')/.test(firstBodyLine.text)) {
        diagnostics.push(makeDiagnostic(filePath, 'missing-docstring', num, text.indexOf(name) + 1,
          `Public class '${name}' is missing a docstring`
        ))
      }
    }
  }

  return diagnostics
}

/**
 * Python-specific deep analysis engine.
 *
 * Detects: bare/broad exception handling, missing type hints, mutable defaults,
 * global variables, star imports, pass/ellipsis stubs, debug prints, f-string
 * logging, and missing docstrings.
 */
export const pythonDeepEngine: Engine = {
  name: ENGINE_NAME,
  description:
    'Python-specific deep analysis: bare/broad exceptions, missing type hints and return types, f-string logging, mutable defaults, global variables, star imports, pass stubs, print statements, and missing docstrings',
  supportedLanguages: ['python'],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now()
    const diagnostics: Diagnostic[] = []
    const files = (context.files ?? []).filter((f) => f.endsWith('.py'))

    for (const filePath of files) {
      try {
        const content = await readFileContent(filePath)
        const ast = await parsePython(content, filePath)
        if (ast && isPythonAvailable()) {
          diagnostics.push(...analyzeWithAST(filePath, ast))
        } else {
          diagnostics.push(...analyzeWithRegex(filePath, content))
        }
      } catch {
        // skip unreadable files
      }
    }

    return {
      engine: this.name,
      diagnostics,
      elapsed: performance.now() - start,
      skipped: false,
    }
  },

  async fix(diagnostics: Diagnostic[], _context: EngineContext): Promise<FixResult> {
    const fixable = diagnostics.filter((d) => d.engine === ENGINE_NAME && d.fixable)
    const remaining = diagnostics.filter((d) => d.engine !== ENGINE_NAME || !d.fixable)
    const modifiedFiles = new Set<string>()
    const filesMap = new Map<string, Diagnostic[]>()

    for (const d of fixable) {
      const list = filesMap.get(d.filePath)
      if (list) {
        list.push(d)
      } else {
        filesMap.set(d.filePath, [d])
      }
    }

    for (const [filePath, diags] of filesMap.entries()) {
      try {
        let content = await readFile(filePath, 'utf-8')
        content = applyFixes(content, diags)
        await writeFile(filePath, content, 'utf-8')
        modifiedFiles.add(filePath)
      } catch {
        // Fix failed for this file — keep diagnostics as remaining
        for (const d of diags) remaining.push(d)
      }
    }

    return {
      fixed: fixable.length - remaining.length,
      remaining,
      modifiedFiles: [...modifiedFiles],
    }
  },
}
