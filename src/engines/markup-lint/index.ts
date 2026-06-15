// ── Markup-Lint Engine ─────────────────────────────
// Quality checks for JSON, YAML, CSS, HTML, and Markdown files.

import { relative } from 'node:path'
import type { Diagnostic, Engine, EngineContext, EngineResult } from '../../types/index.js'
import { readFileContent, toLines } from '../../utils/file-utils.js'
import { collectMarkupFiles, fileType, isMarkupFile } from './shared.js'
import { detectJsonTrailingComma } from './rules/json-trailing-comma.js'
import { detectJsonDuplicateKeys } from './rules/json-duplicate-keys.js'
import { detectJsonInconsistentSpacing } from './rules/json-spacing.js'
import { detectJsonDeepNesting } from './rules/json-deep-nesting.js'
import { detectYamlTabIndent } from './rules/yaml-tab-indent.js'
import { detectYamlDuplicateKeys } from './rules/yaml-duplicate-keys.js'
import { detectYamlComplexAnchor } from './rules/yaml-complex-anchor.js'
import { detectYamlMultiDocUnseparated } from './rules/yaml-multi-doc.js'
import { detectCssUnusedSelector } from './rules/css-unused-selector.js'
import { detectCssImportantOveruse } from './rules/css-important-overuse.js'
import { detectCssDuplicateProperty } from './rules/css-duplicate-property.js'
import { detectCssUniversalSelector } from './rules/css-universal-selector.js'
import { detectHtmlMissingAlt } from './rules/html-missing-alt.js'
import { detectHtmlMissingLang } from './rules/html-missing-lang.js'
import { detectHtmlDeprecatedTag } from './rules/html-deprecated-tags.js'
import { detectHtmlInlineEventHandler } from './rules/html-inline-events.js'
import { detectMdBrokenLink } from './rules/md-broken-links.js'
import { detectMdInconsistentHeading } from './rules/md-heading-style.js'
import { detectMdTodoInDoc } from './rules/md-todo-in-docs.js'
import { detectMdMissingFencedLang } from './rules/md-missing-fenced-lang.js'

export const markupLintEngine: Engine = {
  name: 'markup-lint' as const,
  description: 'Quality checks for JSON, YAML, CSS, HTML, and Markdown files',
  supportedLanguages: ['typescript', 'javascript', 'tsx', 'jsx', 'python', 'go', 'rust', 'ruby', 'php', 'java', 'csharp', 'swift'],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = Date.now()
    const diagnostics: Diagnostic[] = []
    const { rootDirectory, config, files: specifiedFiles } = context

    const filePaths = specifiedFiles
      ? specifiedFiles.filter(isMarkupFile)
      : await collectMarkupFiles(rootDirectory, config.exclude)

    if (filePaths.length === 0) {
      return {
        engine: this.name,
        diagnostics: [],
        elapsed: Date.now() - start,
        skipped: true,
        skipReason: 'No JSON/YAML/CSS/HTML/Markdown files found to analyze',
      }
    }

    for (const fp of filePaths) {
      try {
        const content = await readFileContent(fp)
        const relPath = relative(rootDirectory, fp)
        const lines = toLines(content)
        const type = fileType(fp)

        if (type === 'json') {
          diagnostics.push(...detectJsonTrailingComma(content, lines, relPath))
          diagnostics.push(...detectJsonDuplicateKeys(content, lines, relPath))
          diagnostics.push(...detectJsonInconsistentSpacing(content, lines, relPath))
          diagnostics.push(...detectJsonDeepNesting(content, lines, relPath))
        }

        if (type === 'yaml') {
          diagnostics.push(...detectYamlTabIndent(content, lines, relPath))
          diagnostics.push(...detectYamlDuplicateKeys(content, lines, relPath))
          diagnostics.push(...detectYamlComplexAnchor(content, lines, relPath))
          diagnostics.push(...detectYamlMultiDocUnseparated(content, lines, relPath))
        }

        if (type === 'css') {
          diagnostics.push(...await detectCssUnusedSelector(content, lines, relPath, context))
          diagnostics.push(...detectCssImportantOveruse(content, lines, relPath))
          diagnostics.push(...detectCssDuplicateProperty(content, lines, relPath))
          diagnostics.push(...detectCssUniversalSelector(content, lines, relPath))
        }

        if (type === 'html') {
          diagnostics.push(...detectHtmlMissingAlt(content, lines, relPath))
          diagnostics.push(...detectHtmlMissingLang(content, lines, relPath))
          diagnostics.push(...detectHtmlDeprecatedTag(content, lines, relPath))
          diagnostics.push(...detectHtmlInlineEventHandler(content, lines, relPath))
        }

        if (type === 'markdown') {
          diagnostics.push(...detectMdBrokenLink(content, lines, relPath))
          diagnostics.push(...detectMdInconsistentHeading(content, lines, relPath))
          diagnostics.push(...detectMdTodoInDoc(content, lines, relPath))
          diagnostics.push(...detectMdMissingFencedLang(content, lines, relPath))
        }
      } catch {
        // Skip unreadable files
      }
    }

    const seen = new Set<string>()
    const unique = diagnostics.filter((d) => {
      const key = `${d.filePath}:${d.line}:${d.rule}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return {
      engine: this.name,
      diagnostics: unique,
      elapsed: Date.now() - start,
      skipped: false,
    }
  },
}
