// ── CSS Unused Selector Rule ─────────────────────────────
// CSS selectors that don't match any class/id in HTML/JSX files.

import { extname } from 'node:path'
import type { Diagnostic, EngineContext } from '../../../types/index.js'
import { readFileContent } from '../../../utils/file-utils.js'
import { collectMarkupFiles, makeDiagnostic } from '../shared.js'

export async function detectCssUnusedSelector(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
  context: EngineContext,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = []

  const classRefs = new Set<string>()
  const idRefs = new Set<string>()

  const htmlJsxExts = new Set(['.html', '.htm', '.jsx', '.tsx', '.js', '.ts'])
  const filesToScan = context.files ?? await collectMarkupFiles(context.rootDirectory, context.config.exclude)
  const htmlJsxFiles = filesToScan.filter((f) => htmlJsxExts.has(extname(f)))

  for (const fp of htmlJsxFiles) {
    try {
      const htmlContent = await readFileContent(fp)
      const classPattern = /(?:class|className)\s*=\s*["']([^"']+)["']/g
      let match: RegExpExecArray | null
      while ((match = classPattern.exec(htmlContent)) !== null) {
        for (const cls of match[1].split(/\s+/)) {
          if (cls) classRefs.add(cls)
        }
      }
      const idPattern = /\bid\s*=\s*["']([^"']+)["']/g
      while ((match = idPattern.exec(htmlContent)) !== null) {
        if (match[1]) idRefs.add(match[1])
      }
    } catch {
      // Skip unreadable files
    }
  }

  if (htmlJsxFiles.length === 0) return diagnostics

  for (const { num, text } of lines) {
    const trimmed = text.trim()

    const classSelectorPattern = /^\.([a-zA-Z_-][\w-]*)/
    const classMatch = classSelectorPattern.exec(trimmed)
    if (classMatch) {
      const className = classMatch[1]
      if (!classRefs.has(className)) {
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: 'css/unused-selector',
            message: `CSS class .${className} not found in any HTML/JSX file`,
            line: num,
            severity: 'info',
            category: 'dead-code',
            help: 'Remove unused CSS rules or add the class to an HTML/JSX element',
            fixable: false,
            detail: { selector: `.${className}`, type: 'class' },
          }),
        )
      }
    }

    const idSelectorPattern = /^#([a-zA-Z_-][\w-]*)/
    const idMatch = idSelectorPattern.exec(trimmed)
    if (idMatch) {
      const idName = idMatch[1]
      if (!idRefs.has(idName)) {
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: 'css/unused-selector',
            message: `CSS id #${idName} not found in any HTML/JSX file`,
            line: num,
            severity: 'info',
            category: 'dead-code',
            help: 'Remove unused CSS rules or add the id to an HTML element',
            fixable: false,
            detail: { selector: `#${idName}`, type: 'id' },
          }),
        )
      }
    }
  }

  return diagnostics.slice(0, 20)
}
