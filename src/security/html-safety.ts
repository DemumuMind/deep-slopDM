// ── XSS / HTML injection detection ───────────────────────
// Detects dangerous HTML rendering patterns: innerHTML with
// dynamic content, dangerouslySetInnerHTML, v-html,
// document.write with input, and similar XSS vectors.

import type { Diagnostic, Severity, Suggestion } from '../types/index.js'

// ── Helper: build a diagnostic ──────────────────────────

function makeHtmlDiagnostic(
  filePath: string,
  rule: string,
  severity: Severity,
  message: string,
  help: string,
  line: number,
  column: number,
  opts?: {
    fixable?: boolean
    suggestion?: Suggestion
    detail?: Record<string, unknown>
  }
): Diagnostic {
  return {
    filePath,
    engine: 'security-deep' as const,
    rule,
    severity,
    message,
    help,
    line,
    column,
    category: 'security' as const,
    fixable: opts?.fixable ?? false,
    suggestion: opts?.suggestion,
    detail: opts?.detail,
  }
}

// ── Helper: comment state tracking ──────────────────────

function isCommentLine(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.startsWith('#')) return true
  if (trimmed.startsWith('//')) return true
  if (trimmed.startsWith('/*')) return true
  if (trimmed.startsWith('*')) return true
  return false
}

// ── Helper: check if line is inside JSX/TSX ─────────────

function isJsxFile(filePath: string): boolean {
  return /\.(jsx|tsx)$/.test(filePath)
}

function isVueFile(filePath: string): boolean {
  return /\.vue$/.test(filePath)
}

// ── XSS risk patterns ───────────────────────────────────

interface XssPattern {
  name: string
  pattern: RegExp
  rule: 'security-deep/xss-risk' | 'security-deep/unsafe-html'
  message: (match: RegExpMatchArray) => string
  help: string
  suggestion: Suggestion
  detailName: string
}

const XSS_PATTERNS: XssPattern[] = [
  // innerHTML with dynamic content
  {
    name: 'innerHTML assignment',
    pattern: /\.innerHTML\s*=/,
    rule: 'security-deep/unsafe-html',
    message: () => 'Assignment to .innerHTML can lead to XSS if the value contains user input',
    help: 'Use textContent, innerText, or a sanitization library (e.g., DOMPurify) instead of innerHTML.',
    suggestion: {
      type: 'replace',
      text: '.textContent = ',
      confidence: 0.6,
      reason: 'textContent safely sets text without interpreting HTML, preventing XSS.',
    },
    detailName: 'innerHTML',
  },
  // outerHTML with dynamic content
  {
    name: 'outerHTML assignment',
    pattern: /\.outerHTML\s*=/,
    rule: 'security-deep/unsafe-html',
    message: () => 'Assignment to .outerHTML can lead to XSS if the value contains user input',
    help: 'Use DOM manipulation methods (createElement, appendChild) or a sanitization library instead of outerHTML.',
    suggestion: {
      type: 'refactor',
      text: '/* Replace outerHTML assignment with safe DOM manipulation */',
      confidence: 0.6,
      reason: 'outerHTML replaces the entire element and can inject arbitrary HTML.',
    },
    detailName: 'outerHTML',
  },
  // document.write
  {
    name: 'document.write',
    pattern: /\bdocument\s*\.\s*write\s*\(/,
    rule: 'security-deep/unsafe-html',
    message: () => 'document.write() can lead to XSS and breaks incremental rendering',
    help: 'Use DOM manipulation methods (createElement, appendChild) or framework rendering instead of document.write().',
    suggestion: {
      type: 'refactor',
      text: '/* Replace document.write() with safe DOM manipulation */',
      confidence: 0.7,
      reason: 'document.write() can inject arbitrary HTML and overwrites the document if called after parse.',
    },
    detailName: 'document.write',
  },
  // document.writeln
  {
    name: 'document.writeln',
    pattern: /\bdocument\s*\.\s*writeln\s*\(/,
    rule: 'security-deep/unsafe-html',
    message: () => 'document.writeln() can lead to XSS and breaks incremental rendering',
    help: 'Use DOM manipulation methods (createElement, appendChild) or framework rendering instead of document.writeln().',
    suggestion: {
      type: 'refactor',
      text: '/* Replace document.writeln() with safe DOM manipulation */',
      confidence: 0.7,
      reason: 'document.writeln() has the same XSS risks as document.write().',
    },
    detailName: 'document.writeln',
  },
  // dangerouslySetInnerHTML (React)
  {
    name: 'dangerouslySetInnerHTML',
    pattern: /dangerouslySetInnerHTML\s*=/,
    rule: 'security-deep/xss-risk',
    message: () => 'dangerouslySetInnerHTML renders raw HTML and can lead to XSS',
    help: 'Avoid dangerouslySetInnerHTML. Use React rendering or a sanitization library (e.g., DOMPurify) if raw HTML is required.',
    suggestion: {
      type: 'refactor',
      text: '/* Replace dangerouslySetInnerHTML with safe React rendering or sanitize with DOMPurify */',
      confidence: 0.7,
      reason: 'dangerouslySetInnerHTML bypasses React\'s XSS protection by rendering raw HTML.',
    },
    detailName: 'dangerouslySetInnerHTML',
  },
  // v-html (Vue)
  {
    name: 'v-html',
    pattern: /v-html\s*=/,
    rule: 'security-deep/xss-risk',
    message: () => 'v-html renders raw HTML and can lead to XSS',
    help: 'Avoid v-html. Use Vue template rendering or a sanitization library (e.g., DOMPurify) if raw HTML is required.',
    suggestion: {
      type: 'replace',
      text: 'v-text=',
      confidence: 0.6,
      reason: 'v-text safely renders text content without interpreting HTML, preventing XSS.',
    },
    detailName: 'v-html',
  },
  // innerHTML with template literal interpolation
  {
    name: 'innerHTML with interpolation',
    pattern: /\.innerHTML\s*=\s*`[^`]*\$\{/,
    rule: 'security-deep/xss-risk',
    message: () => 'innerHTML with template literal interpolation — high XSS risk',
    help: 'Never interpolate dynamic values into innerHTML. Use textContent or sanitize with DOMPurify.',
    suggestion: {
      type: 'replace',
      text: '.textContent = ',
      confidence: 0.85,
      reason: 'Template literal interpolation in innerHTML directly injects untrusted values as HTML.',
    },
    detailName: 'innerHTML-interpolation',
  },
  // innerHTML with string concatenation
  {
    name: 'innerHTML with concatenation',
    pattern: /\.innerHTML\s*=\s*['"`][^'"`]*['"`]\s*\+/,
    rule: 'security-deep/xss-risk',
    message: () => 'innerHTML with string concatenation — high XSS risk',
    help: 'Never concatenate dynamic values into innerHTML. Use textContent or sanitize with DOMPurify.',
    suggestion: {
      type: 'replace',
      text: '.textContent = ',
      confidence: 0.85,
      reason: 'String concatenation in innerHTML directly injects untrusted values as HTML.',
    },
    detailName: 'innerHTML-concatenation',
  },
  // insertAdjacentHTML
  {
    name: 'insertAdjacentHTML',
    pattern: /\.insertAdjacentHTML\s*\(/,
    rule: 'security-deep/xss-risk',
    message: () => 'insertAdjacentHTML() renders raw HTML and can lead to XSS',
    help: 'Use insertAdjacentText() or safe DOM manipulation methods instead of insertAdjacentHTML().',
    suggestion: {
      type: 'replace',
      text: '.insertAdjacentText(',
      confidence: 0.7,
      reason: 'insertAdjacentText safely inserts text without interpreting HTML, preventing XSS.',
    },
    detailName: 'insertAdjacentHTML',
  },
  // document.write with input variable
  {
    name: 'document.write with input',
    pattern: /\bdocument\s*\.\s*write\s*\([^)]*\+/,
    rule: 'security-deep/xss-risk',
    message: () => 'document.write() with concatenated input — XSS risk',
    help: 'Avoid document.write() entirely. Use safe DOM manipulation with sanitized content.',
    suggestion: {
      type: 'refactor',
      text: '/* Replace document.write() with safe DOM manipulation */',
      confidence: 0.8,
      reason: 'Concatenating user input into document.write() is a direct XSS vector.',
    },
    detailName: 'document.write-concatenation',
  },
]

// ── Main detection function ─────────────────────────────

export function detectHtmlSafety(
  filePath: string,
  lines: { num: number; text: string }[]
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const { num, text } of lines) {
    // Skip comment lines
    if (isCommentLine(text)) continue

    for (const xssPattern of XSS_PATTERNS) {
      const match = text.match(xssPattern.pattern)
      if (!match) continue

      const col = text.indexOf(match[0]) + 1

      // Skip if the match is clearly inside a string that describes the pattern
      // (e.g. in a diagnostic message or documentation)
      const beforeMatch = text.slice(0, col - 1)
      const quoteCount = (beforeMatch.match(/['"`]/g) ?? []).length
      // If inside an odd number of quotes and the line is a comment, skip
      if (quoteCount % 2 === 1 && isCommentLine(text)) continue

      diagnostics.push(
        makeHtmlDiagnostic(
          filePath,
          xssPattern.rule,
          'error',
          xssPattern.message(match),
          xssPattern.help,
          num,
          col,
          {
            fixable: false,
            suggestion: xssPattern.suggestion,
            detail: {
              pattern: xssPattern.detailName,
              fileContext: isJsxFile(filePath)
                ? 'jsx'
                : isVueFile(filePath)
                  ? 'vue'
                  : 'generic',
            },
          }
        )
      )
    }
  }

  return diagnostics
}
