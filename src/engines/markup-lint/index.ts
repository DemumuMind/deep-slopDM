// deep-slop-ignore-start ast-slop/copy-paste-signature
// deep-slop-ignore-start ast-slop/narrative-comment
// deep-slop-ignore-start ast-slop/trivial-comment
// deep-slop-ignore-start ast-slop/decorative-comment

// ── Markup-Lint Engine ──────────────────────────────────
// Quality checks for JSON, YAML, CSS, HTML, and Markdown files.
// Detects real quality issues beyond formatting: trailing commas,
// duplicate keys, accessibility problems, deprecated tags, etc.

import { readdir } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'
import type {
  Diagnostic,
  Engine,
  EngineContext,
  EngineResult,
} from '../../types/index.js'
import { readFileContent, toLines } from '../../utils/file-utils.js'

// ── Helpers ──────────────────────────────────────────────

const MARKUP_EXTENSIONS = new Set([
  '.json', '.yaml', '.yml', '.css', '.scss',
  '.html', '.htm', '.md', '.markdown',
])

function isMarkupFile(filePath: string): boolean {
  const ext = extname(filePath)
  return MARKUP_EXTENSIONS.has(ext)
}

function fileType(filePath: string): 'json' | 'yaml' | 'css' | 'html' | 'markdown' | null {
  const ext = extname(filePath)
  if (ext === '.json') return 'json'
  if (ext === '.yaml' || ext === '.yml') return 'yaml'
  if (ext === '.css' || ext === '.scss') return 'css'
  if (ext === '.html' || ext === '.htm') return 'html'
  if (ext === '.md' || ext === '.markdown') return 'markdown'
  return null
}

/** Recursively collect file paths under root, respecting exclude list */
async function collectMarkupFiles(
  root: string,
  exclude: string[],
): Promise<string[]> {
  const results: string[] = []

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (exclude.some((pat) => full.includes(pat))) continue
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && isMarkupFile(full)) {
        results.push(full)
      }
    }
  }

  await walk(root)
  return results
}

/** Make a diagnostic with sensible defaults for markup-lint */
function makeDiagnostic(
  overrides: Partial<Diagnostic> & Pick<Diagnostic, 'filePath' | 'rule' | 'message' | 'line'>,
): Diagnostic {
  return {
    engine: 'markup-lint',
    severity: 'info',
    column: 1,
    category: 'style',
    fixable: false,
    help: '',
    ...overrides,
  }
}

// ══════════════════════════════════════════════════════════
// JSON RULES
// ══════════════════════════════════════════════════════════

// ── Rule 1: json/trailing-comma ─────────────────────────
// Trailing commas in JSON objects/arrays are invalid per RFC 8259

function detectJsonTrailingComma(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const { num, text } of lines) {
    const trimmed = text.trimEnd()
    // Trailing comma before closing } or ]
    if (/,\s*$/.test(trimmed)) {
      // Check if next non-blank line starts with } or ]
      const idx = lines.findIndex((l) => l.num === num)
      for (let i = idx + 1; i < lines.length; i++) {
        const nextTrimmed = lines[i].text.trim()
        if (nextTrimmed.length === 0) continue
        if (/^[}\]]/.test(nextTrimmed)) {
          diagnostics.push(
            makeDiagnostic({
              filePath,
              rule: 'json/trailing-comma',
              message: 'Trailing comma before closing bracket — invalid JSON (RFC 8259)',
              line: num,
              column: trimmed.lastIndexOf(',') + 1,
              severity: 'error',
              category: 'syntax',
              help: 'Remove the trailing comma. JSON does not allow trailing commas per the specification.',
              fixable: true,
              suggestion: {
                type: 'replace',
                text: trimmed.replace(/,\s*$/, ''),
                confidence: 0.95,
                reason: 'Trailing commas make JSON invalid and cause parse errors in strict parsers',
              },
            }),
          )
        }
        break
      }
    }
  }

  return diagnostics
}

// ── Rule 2: json/duplicate-keys ─────────────────────────
// Duplicate keys in the same JSON object

function detectJsonDuplicateKeys(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  // Track keys per nesting depth to find duplicates in the same object
  const keyPattern = /^\s*"([^"]+)"\s*:/
  const objectStack: Map<string, number>[] = [new Map()]
  let braceDepth = 0

  for (const { num, text } of lines) {
    for (const ch of text) {
      if (ch === '{') {
        braceDepth++
        objectStack.push(new Map())
      } else if (ch === '}') {
        objectStack.pop()
        braceDepth--
      }
    }

    const match = keyPattern.exec(text)
    if (match) {
      const key = match[1]
      const currentObj = objectStack[objectStack.length - 1]
      if (!currentObj) continue

      if (currentObj.has(key)) {
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: 'json/duplicate-keys',
            message: `Duplicate key "${key}" in same object — last occurrence wins silently`,
            line: num,
            severity: 'error',
            category: 'syntax',
            help: `Rename or remove the duplicate key. The first occurrence was on line ${currentObj.get(key)}.`,
            fixable: false,
            detail: { key, firstOccurrence: currentObj.get(key) },
          }),
        )
      } else {
        currentObj.set(key, num)
      }
    }
  }

  return diagnostics
}

// ── Rule 3: json/inconsistent-spacing ───────────────────
// Mixed spacing in object/array formatting

function detectJsonInconsistentSpacing(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  // Detect mixed use of compact vs expanded formatting
  let compactLines = 0  // Lines with multiple key-value pairs
  let expandedLines = 0 // Lines with single key-value pair inside object

  for (const { num, text } of lines) {
    const trimmed = text.trim()
    // Compact: multiple key-value pairs on one line
    if (/^\s*"[^"]+"\s*:\s*[^,]+,\s*"[^"]+"\s*:/.test(trimmed)) {
      compactLines++
    }
    // Expanded: single key-value pair
    if (/^\s*"[^"]+"\s*:\s*[^,]+\s*,?\s*$/.test(trimmed) && !trimmed.includes('},')) {
      expandedLines++
    }
  }

  if (compactLines > 0 && expandedLines > 0 && compactLines >= 2 && expandedLines >= 2) {
    // Find first compact line to report
    for (const { num, text } of lines) {
      if (/^\s*"[^"]+"\s*:\s*[^,]+,\s*"[^"]+"\s*:/.test(text.trim())) {
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: 'json/inconsistent-spacing',
            message: 'Mixed compact and expanded object formatting in same file',
            line: num,
            severity: 'info',
            category: 'style',
            help: 'Pick one style: either compact single-line objects or expanded multi-line formatting',
            fixable: false,
            detail: { compactLines, expandedLines },
          }),
        )
        break
      }
    }
  }

  return diagnostics
}

// ── Rule 4: json/deep-nesting ───────────────────────────
// Objects nested more than 5 levels

function detectJsonDeepNesting(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const MAX_DEPTH = 5
  let depth = 0

  for (const { num, text } of lines) {
    for (const ch of text) {
      if (ch === '{' || ch === '[') {
        depth++
        if (depth > MAX_DEPTH) {
          diagnostics.push(
            makeDiagnostic({
              filePath,
              rule: 'json/deep-nesting',
              message: `JSON nested ${depth} levels deep — exceeds max of ${MAX_DEPTH}`,
              line: num,
              severity: 'warning',
              category: 'architecture',
              help: 'Flatten the structure or extract nested objects into separate files/sections',
              fixable: false,
              detail: { depth, maxDepth: MAX_DEPTH },
            }),
          )
          // Only report once per exceed event
          break
        }
      } else if (ch === '}' || ch === ']') {
        depth--
      }
    }
  }

  return diagnostics
}

// ══════════════════════════════════════════════════════════
// YAML RULES
// ══════════════════════════════════════════════════════════

// ── Rule 5: yaml/tab-indent ─────────────────────────────
// Tabs used for indentation (YAML requires spaces)

function detectYamlTabIndent(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  let reported = 0

  for (const { num, text } of lines) {
    if (/^\t/.test(text)) {
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'yaml/tab-indent',
          message: 'Tab character used for indentation — YAML requires spaces',
          line: num,
          severity: 'error',
          category: 'syntax',
          help: 'Replace tabs with spaces. YAML spec requires space indentation for structure.',
          fixable: true,
          suggestion: {
            type: 'replace',
            text: text.replace(/^\t+/, (match) => '  '.repeat(match.length)),
            confidence: 0.9,
            reason: 'YAML parsers reject tab indentation; spaces are required per the specification',
          },
        }),
      )
      reported++
      if (reported >= 10) break // Cap at 10
    }
  }

  return diagnostics
}

// ── Rule 6: yaml/duplicate-keys ────────────────────────
// Duplicate keys in same YAML mapping

function detectYamlDuplicateKeys(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  // Track keys per indentation level (approximation of mapping scope)
  const keyPattern = /^(\s*)([\w][\w.-]*)\s*:/
  const scopeStack: { indent: number; keys: Map<string, number> }[] = [{ indent: -1, keys: new Map() }]

  for (const { num, text } of lines) {
    const match = keyPattern.exec(text)
    if (!match) continue

    const indent = match[1].length
    const key = match[2]

    // Pop scopes that are deeper than current indent
    while (scopeStack.length > 1 && scopeStack[scopeStack.length - 1].indent >= indent) {
      scopeStack.pop()
    }

    const currentScope = scopeStack[scopeStack.length - 1]
    if (currentScope.keys.has(key)) {
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'yaml/duplicate-keys',
          message: `Duplicate key "${key}" in same mapping — last occurrence wins silently`,
          line: num,
          severity: 'error',
          category: 'syntax',
          help: `Rename or remove the duplicate key. First occurrence was on line ${currentScope.keys.get(key)}.`,
          fixable: false,
          detail: { key, firstOccurrence: currentScope.keys.get(key) },
        }),
      )
    } else {
      currentScope.keys.set(key, num)
    }

    // Push a new scope for nested mappings
    scopeStack.push({ indent, keys: new Map() })
  }

  return diagnostics
}

// ── Rule 7: yaml/complex-anchor ─────────────────────────
// Complex YAML anchors/aliases that are hard to read

function detectYamlComplexAnchor(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const anchorPattern = /&(\w+)/g
  const aliasPattern = /\*(\w+)/g
  const anchors = new Map<string, { line: number; refCount: number }>()

  // Find all anchors
  for (const { num, text } of lines) {
    let match: RegExpExecArray | null
    anchorPattern.lastIndex = 0
    while ((match = anchorPattern.exec(text)) !== null) {
      anchors.set(match[1], { line: num, refCount: 0 })
    }
  }

  // Count alias references
  for (const { text } of lines) {
    aliasPattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = aliasPattern.exec(text)) !== null) {
      const anchor = anchors.get(match[1])
      if (anchor) anchor.refCount++
    }
  }

  // Flag anchors referenced 3+ times (complex propagation)
  for (const [name, info] of anchors) {
    if (info.refCount >= 3) {
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'yaml/complex-anchor',
          message: `Anchor &${name} is aliased ${info.refCount} times — hard to trace data flow`,
          line: info.line,
          severity: 'info',
          category: 'architecture',
          help: 'Consider extracting shared values into a separate config file or reducing alias usage',
          fixable: false,
          detail: { anchorName: name, refCount: info.refCount },
        }),
      )
    }
  }

  return diagnostics
}

// ── Rule 8: yaml/multi-doc-unseparated ──────────────────
// Multiple documents without --- separator

function detectYamlMultiDocUnseparated(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  // If there are --- separators, this is a multi-doc file — OK
  const hasExplicitSeparator = lines.some((l) => l.text.trim() === '---')
  if (hasExplicitSeparator) return diagnostics

  // Heuristic: check for multiple top-level keys at indent 0
  // This can indicate accidentally concatenated documents
  const topLevelKeyPattern = /^[\w][\w.-]*\s*:/
  const topLevelKeys: { key: string; line: number }[] = []

  for (const { num, text } of lines) {
    const match = topLevelKeyPattern.exec(text)
    if (match) {
      topLevelKeys.push({ key: match[1] ?? match[0], line: num })
    }
  }

  // If there are multiple "sections" of top-level keys with blank lines between them
  if (topLevelKeys.length >= 4) {
    let gapCount = 0
    for (let i = 1; i < topLevelKeys.length; i++) {
      const gap = topLevelKeys[i].line - topLevelKeys[i - 1].line
      if (gap > 2) gapCount++
    }

    if (gapCount >= 2) {
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'yaml/multi-doc-unseparated',
          message: 'Possible multiple YAML documents without --- separator',
          line: topLevelKeys[0].line,
          severity: 'warning',
          category: 'syntax',
          help: 'Add --- separators between documents, or merge into a single document with a top-level key',
          fixable: false,
          detail: { topLevelKeyCount: topLevelKeys.length, gapCount },
        }),
      )
    }
  }

  return diagnostics
}

// ══════════════════════════════════════════════════════════
// CSS RULES
// ══════════════════════════════════════════════════════════

// ── Rule 9: css/unused-selector ─────────────────────────
// CSS selectors that don't match any class/id in HTML/JSX files

async function detectCssUnusedSelector(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
  context: EngineContext,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = []

  // Extract class and id references from HTML/JSX files in the project
  const classRefs = new Set<string>()
  const idRefs = new Set<string>()

  const htmlJsxExts = new Set(['.html', '.htm', '.jsx', '.tsx', '.js', '.ts'])
  const filesToScan = context.files ?? await collectMarkupFiles(context.rootDirectory, context.config.exclude)
  const htmlJsxFiles = filesToScan.filter((f) => htmlJsxExts.has(extname(f)))

  for (const fp of htmlJsxFiles) {
    try {
      const htmlContent = await readFileContent(fp)
      // Extract class names from class="..." and className="..."
      const classPattern = /(?:class|className)\s*=\s*["']([^"']+)["']/g
      let match: RegExpExecArray | null
      while ((match = classPattern.exec(htmlContent)) !== null) {
        for (const cls of match[1].split(/\s+/)) {
          if (cls) classRefs.add(cls)
        }
      }
      // Extract id names from id="..."
      const idPattern = /\bid\s*=\s*["']([^"']+)["']/g
      while ((match = idPattern.exec(htmlContent)) !== null) {
        if (match[1]) idRefs.add(match[1])
      }
    } catch {
      // Skip unreadable files
    }
  }

  // If no HTML/JSX files found, skip this rule (can't determine usage)
  if (htmlJsxFiles.length === 0) return diagnostics

  // Extract CSS selectors and check against references
  for (const { num, text } of lines) {
    const trimmed = text.trim()

    // Match class selectors: .something
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

    // Match id selectors: #something
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

  // Cap at 20 per file
  return diagnostics.slice(0, 20)
}

// ── Rule 10: css/important-overuse ──────────────────────
// More than 3 !important declarations in one file

function detectCssImportantOveruse(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const MAX_IMPORTANT = 3
  const importantLines: { num: number }[] = []

  for (const { num, text } of lines) {
    if (/!important\b/i.test(text)) {
      importantLines.push({ num })
    }
  }

  if (importantLines.length > MAX_IMPORTANT) {
    // Report on the file level (first occurrence)
    diagnostics.push(
      makeDiagnostic({
        filePath,
        rule: 'css/important-overuse',
        message: `${importantLines.length} !important declarations in file — exceeds max of ${MAX_IMPORTANT}`,
        line: importantLines[0].num,
        severity: 'warning',
        category: 'style',
        help: 'Reduce !important usage by increasing selector specificity instead. Overuse indicates specificity conflicts.',
        fixable: false,
        detail: { count: importantLines.length, max: MAX_IMPORTANT },
      }),
    )
  }

  return diagnostics
}

// ── Rule 11: css/duplicate-property ─────────────────────
// Same CSS property defined twice in one rule

function detectCssDuplicateProperty(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const propertyPattern = /^\s*([\w-]+)\s*:/

  // Track properties per CSS rule block
  const currentProps = new Map<string, number>()

  for (const { num, text } of lines) {
    const trimmed = text.trim()

    // Detect rule start (selector line ending with {)
    if (trimmed.endsWith('{')) {
      currentProps.clear()
      continue
    }

    // Detect rule end
    if (trimmed.startsWith('}')) {
      currentProps.clear()
      continue
    }

    // Detect property
    const match = propertyPattern.exec(text)
    if (match) {
      const prop = match[1].toLowerCase()
      if (currentProps.has(prop)) {
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: 'css/duplicate-property',
            message: `Duplicate property "${prop}" in same rule block — first defined on line ${currentProps.get(prop)}`,
            line: num,
            severity: 'warning',
            category: 'syntax',
            help: 'Remove the duplicate property. The last definition wins, which may not be intended.',
            fixable: true,
            suggestion: {
              type: 'delete',
              text: '',
              confidence: 0.8,
              reason: 'Duplicate properties are usually accidental; the last one wins silently',
            },
            detail: { property: prop, firstLine: currentProps.get(prop) },
          }),
        )
      } else {
        currentProps.set(prop, num)
      }
    }
  }

  return diagnostics
}

// ── Rule 12: css/universal-selector ──────────────────────
// Universal selector * used (performance impact)

function detectCssUniversalSelector(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  let reported = 0

  for (const { num, text } of lines) {
    const trimmed = text.trim()
    // Universal selector: starts with * or has * followed by :: or space
    if (/^\*\s*(?:[,:{]|$|::)/.test(trimmed) || /\*\s*:/.test(trimmed)) {
      // Exclude *= (attribute selector) and */ (comment end)
      if (/\*=/.test(trimmed) || trimmed === '*/') continue

      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'css/universal-selector',
          message: 'Universal selector * used — has performance impact on large DOMs',
          line: num,
          severity: 'info',
          category: 'performance',
          help: 'Replace with a more specific selector. Universal selectors force the browser to check every element.',
          fixable: false,
          detail: { selector: '*' },
        }),
      )
      reported++
      if (reported >= 5) break
    }
  }

  return diagnostics
}

// ══════════════════════════════════════════════════════════
// HTML RULES
// ══════════════════════════════════════════════════════════

// ── Rule 13: html/missing-alt ───────────────────────────
// <img> tags without alt attribute

function detectHtmlMissingAlt(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const { num, text } of lines) {
    // Match <img tags that don't have alt=
    const imgPattern = /<img\b[^>]*>/gi
    let match: RegExpExecArray | null
    imgPattern.lastIndex = 0
    while ((match = imgPattern.exec(text)) !== null) {
      const imgTag = match[0]
      if (!/\balt\s*=/i.test(imgTag)) {
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: 'html/missing-alt',
            message: '<img> tag missing alt attribute — accessibility violation (WCAG 1.1.1)',
            line: num,
            column: match.index + 1,
            severity: 'error',
            category: 'style',
            help: 'Add alt="description" for meaningful images, or alt="" for decorative images',
            fixable: true,
            suggestion: {
              type: 'insert',
              text: ' alt=""',
              confidence: 0.7,
              reason: 'Missing alt attributes fail WCAG 1.1.1 and are inaccessible to screen readers',
            },
          }),
        )
      }
    }
  }

  return diagnostics
}

// ── Rule 14: html/missing-lang ──────────────────────────
// <html> tag without lang attribute

function detectHtmlMissingLang(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const { num, text } of lines) {
    const htmlPattern = /<html\b[^>]*>/gi
    let match: RegExpExecArray | null
    htmlPattern.lastIndex = 0
    while ((match = htmlPattern.exec(text)) !== null) {
      const htmlTag = match[0]
      if (!/\blang\s*=/i.test(htmlTag)) {
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: 'html/missing-lang',
            message: '<html> tag missing lang attribute — accessibility issue (WCAG 3.1.1)',
            line: num,
            column: match.index + 1,
            severity: 'warning',
            category: 'style',
            help: 'Add lang="en" (or appropriate language code) to the <html> tag',
            fixable: true,
            suggestion: {
              type: 'insert',
              text: ' lang="en"',
              confidence: 0.7,
              reason: 'Missing lang attribute fails WCAG 3.1.1 and hinders screen readers and search engines',
            },
          }),
        )
      }
    }
  }

  return diagnostics
}

// ── Rule 15: html/deprecated-tag ────────────────────────
// Deprecated HTML tags (font, center, marquee, blink)

function detectHtmlDeprecatedTag(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const deprecatedTags = ['font', 'center', 'marquee', 'blink', 'big', 'strike', 'tt', 'frame', 'frameset', 'noframes']
  const tagPattern = new RegExp(`<(${deprecatedTags.join('|')})\\b`, 'gi')

  for (const { num, text } of lines) {
    tagPattern.lastIndex = 0
    const match = tagPattern.exec(text)
    if (match) {
      const tag = match[1].toLowerCase()
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'html/deprecated-tag',
          message: `Deprecated HTML tag <${tag}> — removed from HTML5 spec`,
          line: num,
          column: match.index + 1,
          severity: 'warning',
          category: 'syntax',
          help: `Replace <${tag}> with CSS or semantic HTML. Use <span> with CSS for styling, <div> with text-align for centering.`,
          fixable: false,
          detail: { tag },
        }),
      )
    }
  }

  return diagnostics
}

// ── Rule 16: html/inline-event-handler ──────────────────
// Inline event handlers (onclick=, onload=)

function detectHtmlInlineEventHandler(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const eventHandlers = [
    'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover',
    'onmousemove', 'onmouseout', 'onkeydown', 'onkeypress', 'onkeyup',
    'onload', 'onunload', 'onfocus', 'onblur', 'onsubmit', 'onreset',
    'onchange', 'onselect', 'oninput', 'onerror', 'onresize', 'onscroll',
  ]
  const handlerPattern = new RegExp(`\\b(${eventHandlers.join('|')})\\s*=`, 'gi')

  for (const { num, text } of lines) {
    handlerPattern.lastIndex = 0
    const match = handlerPattern.exec(text)
    if (match) {
      const handler = match[1].toLowerCase()
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'html/inline-event-handler',
          message: `Inline event handler ${handler}= — mixes behavior with structure (CSP violation risk)`,
          line: num,
          column: match.index + 1,
          severity: 'warning',
          category: 'security',
          help: `Move ${handler} to an external JavaScript file using addEventListener(). Inline handlers violate Content Security Policy.`,
          fixable: false,
          detail: { handler },
        }),
      )
    }
  }

  return diagnostics
}

// ══════════════════════════════════════════════════════════
// MARKDOWN RULES
// ══════════════════════════════════════════════════════════

// ── Rule 17: md/broken-link ─────────────────────────────
// Links with empty or # URLs

function detectMdBrokenLink(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  // Match [text](url) markdown links
  const linkPattern = /\[([^\]]*)\]\(([^)]*)\)/g

  for (const { num, text } of lines) {
    linkPattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = linkPattern.exec(text)) !== null) {
      const linkText = match[1]
      const url = match[2].trim()

      // Empty URL or just #
      if (url === '' || url === '#') {
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: 'md/broken-link',
            message: `Link "${linkText}" has ${url === '' ? 'empty' : 'placeholder (#)'} URL`,
            line: num,
            column: match.index + 1,
            severity: 'warning',
            category: 'syntax',
            help: 'Add the correct URL for this link, or remove the link if not needed',
            fixable: false,
            detail: { linkText, url },
          }),
        )
      }
    }
  }

  return diagnostics
}

// ── Rule 18: md/inconsistent-heading ────────────────────
// Mixed heading styles (ATX # vs Setext ===)

function detectMdInconsistentHeading(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  let atxHeadings = 0  // # style
  let setextHeadings = 0  // === or --- style

  for (let i = 0; i < lines.length; i++) {
    const { num, text } = lines[i]
    const trimmed = text.trim()

    // ATX heading: starts with #
    if (/^#{1,6}\s/.test(trimmed)) {
      atxHeadings++
    }

    // Setext heading: next line is === or ---
    if (i + 1 < lines.length) {
      const nextTrimmed = lines[i + 1].text.trim()
      if (/^=+\s*$/.test(nextTrimmed) || /^-+\s*$/.test(nextTrimmed)) {
        setextHeadings++
      }
    }
  }

  if (atxHeadings > 0 && setextHeadings > 0) {
    // Find first Setext heading to report
    for (let i = 0; i < lines.length; i++) {
      const { num, text } = lines[i]
      if (i + 1 < lines.length) {
        const nextTrimmed = lines[i + 1].text.trim()
        if (/^=+\s*$/.test(nextTrimmed) || /^-+\s*$/.test(nextTrimmed)) {
          diagnostics.push(
            makeDiagnostic({
              filePath,
              rule: 'md/inconsistent-heading',
              message: 'Mixed heading styles (ATX # and Setext ===/---) — use one style consistently',
              line: num,
              severity: 'info',
              category: 'style',
              help: 'Pick one heading style: ATX (# ) is more common and supports all heading levels',
              fixable: false,
              detail: { atxHeadings, setextHeadings },
            }),
          )
          break
        }
      }
    }
  }

  return diagnostics
}

// ── Rule 19: md/todo-in-doc ─────────────────────────────
// TODO/FIXME/HACK comments in documentation

function detectMdTodoInDoc(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const todoPattern = /\b(TODO|FIXME|HACK|XXX|BUG)\b/gi
  let reported = 0

  for (const { num, text } of lines) {
    todoPattern.lastIndex = 0
    const match = todoPattern.exec(text)
    if (match) {
      const marker = match[1].toUpperCase()
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'md/todo-in-doc',
          message: `${marker} marker found in documentation — resolve or track in issue tracker`,
          line: num,
          column: match.index + 1,
          severity: 'info',
          category: 'dead-code',
          help: 'Create a tracking issue for this TODO/FIXME and reference it in the document, or resolve it',
          fixable: false,
          detail: { marker },
        }),
      )
      reported++
      if (reported >= 10) break
    }
  }

  return diagnostics
}

// ── Rule 20: md/missing-fenced-lang ──────────────────────
// Fenced code blocks without language specification

function detectMdMissingFencedLang(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const { num, text } of lines) {
    const trimmed = text.trim()
    // Fenced code block opening: ``` or ~~~ without a language tag
    if (/^```+\s*$/.test(trimmed) || /^~~~+\s*$/.test(trimmed)) {
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'md/missing-fenced-lang',
          message: 'Fenced code block without language specification — disables syntax highlighting',
          line: num,
          severity: 'suggestion',
          category: 'style',
          help: 'Add a language identifier after the fence: ```typescript, ```python, ```bash, etc.',
          fixable: true,
          suggestion: {
            type: 'replace',
            text: trimmed.replace(/^(```+|~~~+)/, '$1text'),
            confidence: 0.6,
            reason: 'Language-specific syntax highlighting improves readability of code blocks',
          },
        }),
      )
    }
  }

  return diagnostics
}

// ══════════════════════════════════════════════════════════
// MAIN ENGINE
// ══════════════════════════════════════════════════════════

export const markupLintEngine: Engine = {
  name: 'markup-lint' as const,
  description: 'Quality checks for JSON, YAML, CSS, HTML, and Markdown files',
  supportedLanguages: ['typescript', 'javascript', 'tsx', 'jsx', 'python', 'go', 'rust', 'ruby', 'php', 'java', 'csharp', 'swift'],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = Date.now()
    const diagnostics: Diagnostic[] = []
    const { rootDirectory, config, files: specifiedFiles } = context

    // Collect markup files
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

    // Read and analyze each file
    for (const fp of filePaths) {
      try {
        const content = await readFileContent(fp)
        const relPath = relative(rootDirectory, fp)
        const lines = toLines(content)
        const type = fileType(fp)

        // JSON rules
        if (type === 'json') {
          diagnostics.push(...detectJsonTrailingComma(content, lines, relPath))
          diagnostics.push(...detectJsonDuplicateKeys(content, lines, relPath))
          diagnostics.push(...detectJsonInconsistentSpacing(content, lines, relPath))
          diagnostics.push(...detectJsonDeepNesting(content, lines, relPath))
        }

        // YAML rules
        if (type === 'yaml') {
          diagnostics.push(...detectYamlTabIndent(content, lines, relPath))
          diagnostics.push(...detectYamlDuplicateKeys(content, lines, relPath))
          diagnostics.push(...detectYamlComplexAnchor(content, lines, relPath))
          diagnostics.push(...detectYamlMultiDocUnseparated(content, lines, relPath))
        }

        // CSS rules
        if (type === 'css') {
          diagnostics.push(...await detectCssUnusedSelector(content, lines, relPath, context))
          diagnostics.push(...detectCssImportantOveruse(content, lines, relPath))
          diagnostics.push(...detectCssDuplicateProperty(content, lines, relPath))
          diagnostics.push(...detectCssUniversalSelector(content, lines, relPath))
        }

        // HTML rules
        if (type === 'html') {
          diagnostics.push(...detectHtmlMissingAlt(content, lines, relPath))
          diagnostics.push(...detectHtmlMissingLang(content, lines, relPath))
          diagnostics.push(...detectHtmlDeprecatedTag(content, lines, relPath))
          diagnostics.push(...detectHtmlInlineEventHandler(content, lines, relPath))
        }

        // Markdown rules
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

    // Deduplicate diagnostics (same file + line + rule)
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

// deep-slop-ignore-end ast-slop/decorative-comment
// deep-slop-ignore-end ast-slop/trivial-comment
// deep-slop-ignore-end ast-slop/narrative-comment
// deep-slop-ignore-end ast-slop/copy-paste-signature
