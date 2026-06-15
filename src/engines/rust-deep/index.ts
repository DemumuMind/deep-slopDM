// ── Rust Deep Engine ────────────────────────────────────
// Regex-based analysis of Rust code for common AI slop / quality issues.
// Falls back to regex only; tree-sitter Rust parser is available via
// src/utils/tree-sitter/ but is not required for this engine.

import { readdir } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'
import type {
  Diagnostic,
  Engine,
  EngineContext,
  EngineResult,
  Severity,
  Suggestion,
} from '../../types/index.js'
import { readFileContent, toLines } from '../../utils/file-utils.js'

// ── Helpers ──────────────────────────────────────────────

const RUST_EXTENSIONS = new Set(['.rs'])

function isRustFile(filePath: string): boolean {
  return RUST_EXTENSIONS.has(extname(filePath).toLowerCase())
}

/** Recursively collect .rs files under root, respecting excludes */
async function collectRustFiles(
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
      } else if (entry.isFile() && isRustFile(full)) {
        results.push(full)
      }
    }
  }

  await walk(root)
  return results
}

function relativePath(root: string, filePath: string): string {
  return relative(root, filePath).replace(/\\/g, '/')
}

function makeDiagnostic(
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
  },
): Diagnostic {
  return {
    filePath,
    engine: 'rust-deep' as const,
    rule,
    severity,
    message,
    help,
    line,
    column,
    category: 'syntax' as const,
    fixable: opts?.fixable ?? false,
    suggestion: opts?.suggestion,
    detail: opts?.detail,
  }
}

// ── Comment / string helpers ───────────────────────────────

/**
 * Track whether a line is inside a block comment (`/* ... *\/`).
 * Returns { skip, inBlockComment } — skip means the line is entirely
 * comment and should be ignored for pattern matching.
 */
function checkCommentState(
  text: string,
  inBlockComment: boolean,
): { skip: boolean; inBlockComment: boolean } {
  if (inBlockComment) {
    const closeIdx = text.indexOf('*/')
    if (closeIdx === -1) return { skip: true, inBlockComment: true }
    const afterClose = text.substring(closeIdx + 2)
    const reopenIdx = afterClose.indexOf('/*')
    if (reopenIdx !== -1) {
      const recloseIdx = afterClose.indexOf('*/', reopenIdx + 2)
      return { skip: true, inBlockComment: recloseIdx === -1 }
    }
    return { skip: true, inBlockComment: false }
  }

  const trimmed = text.trim()
  if (trimmed.startsWith('//')) return { skip: true, inBlockComment: false }
  if (trimmed.startsWith('/*')) {
    const closeIdx = text.indexOf('*/', text.indexOf('/*') + 2)
    return { skip: true, inBlockComment: closeIdx === -1 }
  }

  // Mid-line block comment opener
  const openIdx = text.indexOf('/*')
  if (openIdx !== -1) {
    const afterOpen = text.substring(openIdx + 2)
    const closeIdx = afterOpen.indexOf('*/')
    return { skip: false, inBlockComment: closeIdx === -1 }
  }

  return { skip: false, inBlockComment: false }
}

/**
 * Returns true when `matchStart` falls inside a string literal.
 * Heuristic: count unescaped single/double quotes before matchStart.
 */
function isInsideString(text: string, matchStart: number): boolean {
  let sq = 0
  let dq = 0
  let raw = false
  for (let i = 0; i < matchStart; i++) {
    const ch = text[i]
    const prev = i > 0 ? text[i - 1] : ''
    if (ch === 'r' && i + 1 < matchStart && text[i + 1] === '"') {
      raw = true
      continue
    }
    if (raw && ch === '"') {
      // Find matching raw string end
      const end = text.indexOf('"', i + 1)
      if (end !== -1 && end < matchStart) {
        i = end
        continue
      }
      raw = false
      continue
    }
    if (prev !== '\\') {
      if (ch === "'") sq++
      else if (ch === '"') dq++
    }
  }
  return sq % 2 === 1 || dq % 2 === 1
}

function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  if (normalized.endsWith('.test.rs') || normalized.endsWith('_test.rs')) return true
  if (normalized.endsWith('.rs') && (normalized.includes('/tests/') || normalized.includes('/test/'))) return true
  return false
}

function isInsideMacroOrString(text: string, matchStart: number): boolean {
  return isInsideString(text, matchStart)
}

// ── Rule 1: unwrap-in-prod ───────────────────────────────

function detectUnwrapInProd(
  filePath: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const re = /\.unwrap\s*\(\)/
  let inBlockComment = false

  for (const { num, text } of lines) {
    const state = checkCommentState(text, inBlockComment)
    inBlockComment = state.inBlockComment
    if (state.skip) continue

    const match = re.exec(text)
    if (!match) continue
    const col = match.index
    if (isInsideMacroOrString(text, col)) continue

    const preceding = text.slice(0, col).trim()
    const isTestContext =
      text.includes('#[test]') ||
      preceding.includes('cfg(test)') ||
      filePath.includes('/tests/') ||
      isTestFile(filePath)
    if (isTestContext) continue

    diagnostics.push(
      makeDiagnostic(
        filePath,
        'rust-deep/unwrap-in-prod',
        'error',
        '.unwrap() on Option/Result in production code can panic',
        'Use unwrap_or_default(), unwrap_or(), if let, or match to handle the None/Err case safely.',
        num,
        col + 1,
        {
          fixable: true,
          suggestion: {
            type: 'replace',
            text: '.unwrap_or_default()',
            confidence: 0.6,
            reason: 'unwrap_or_default() provides a safe fallback instead of panicking.',
          },
        },
      ),
    )
  }

  return diagnostics
}

// ── Rule 2: todo-macro ───────────────────────────────────

function detectTodoMacro(
  filePath: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const re = /\btodo!\s*\(/
  let inBlockComment = false

  for (const { num, text } of lines) {
    const state = checkCommentState(text, inBlockComment)
    inBlockComment = state.inBlockComment
    if (state.skip) continue

    const match = re.exec(text)
    if (!match) continue
    const col = match.index
    if (isInsideMacroOrString(text, col)) continue

    diagnostics.push(
      makeDiagnostic(
        filePath,
        'rust-deep/todo-macro',
        'error',
        'todo!() macro left in code — implementation is incomplete',
        'Implement the missing logic or replace todo!() with a proper error handling path.',
        num,
        col + 1,
        {
          fixable: true,
          suggestion: {
            type: 'replace',
            text: 'unimplemented!("replace with real implementation")',
            confidence: 0.5,
            reason: 'A placeholder message is better than a bare todo!(), but real implementation is preferred.',
          },
        },
      ),
    )
  }

  return diagnostics
}

// ── Rule 3: unimplemented-macro ───────────────────────────

function detectUnimplementedMacro(
  filePath: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const re = /\bunimplemented!\s*\(/
  let inBlockComment = false

  for (const { num, text } of lines) {
    const state = checkCommentState(text, inBlockComment)
    inBlockComment = state.inBlockComment
    if (state.skip) continue

    const match = re.exec(text)
    if (!match) continue
    const col = match.index
    if (isInsideMacroOrString(text, col)) continue

    diagnostics.push(
      makeDiagnostic(
        filePath,
        'rust-deep/unimplemented-macro',
        'error',
        'unimplemented!() macro left in code — feature is incomplete',
        'Implement the missing behavior or remove the unimplemented!() stub.',
        num,
        col + 1,
        {
          fixable: true,
          suggestion: {
            type: 'replace',
            text: 'todo!("replace with real implementation")',
            confidence: 0.5,
            reason: 'A TODO marker is a smaller placeholder, but real implementation is preferred.',
          },
        },
      ),
    )
  }

  return diagnostics
}

// ── Rule 4: clone-on-copy ────────────────────────────────
// Heuristic: .clone() on values that are likely Copy types (literals, primitive
// bindings, or variables declared with primitive types on the same line).

function detectCloneOnCopy(
  filePath: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const cloneRe = /\.clone\s*\(\)/
  const primitiveTypeRe = /\b(?:i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize|f32|f64|bool|char)\b/
  let inBlockComment = false

  for (const { num, text } of lines) {
    const state = checkCommentState(text, inBlockComment)
    inBlockComment = state.inBlockComment
    if (state.skip) continue

    const match = cloneRe.exec(text)
    if (!match) continue
    const col = match.index
    if (isInsideMacroOrString(text, col)) continue

    const before = text.slice(0, col)
    const target = before.trim().split(/\s+/).pop() ?? ''

    // Literal or primitive-looking target
    const isLikelyCopy =
      /^\d/.test(target) ||
      /^(?:true|false)$/.test(target) ||
      /^'.'$/.test(target) ||
      primitiveTypeRe.test(before)

    if (!isLikelyCopy) continue

    diagnostics.push(
      makeDiagnostic(
        filePath,
        'rust-deep/clone-on-copy',
        'warning',
        `.clone() on a value that likely implements Copy is redundant`,
        'Copy types are implicitly copied. Remove the .clone() call.',
        num,
        col + 1,
        {
          fixable: true,
          suggestion: {
            type: 'delete',
            text: '',
            confidence: 0.7,
            reason: 'Copy types do not need explicit cloning; removing .clone() is safe.',
          },
        },
      ),
    )
  }

  return diagnostics
}

// ── Rule 5: large-enum-variant ───────────────────────────
// Heuristic: enum variant contains a large heap type (String, Vec, Box) while
// other variants are unit or small. This is a coarse regex-based estimate.

function detectLargeEnumVariant(
  filePath: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const enumStartRe = /^\s*enum\s+\w+/
  const largeTypeRe = /\b(?:String|Vec|Box|HashMap|BTreeMap|HashSet|BTreeSet|VecDeque|Rope|OsString|PathBuf)\s*[<\(]/
  let inBlockComment = false

  for (let i = 0; i < lines.length; i++) {
    const { num, text } = lines[i]
    const state = checkCommentState(text, inBlockComment)
    inBlockComment = state.inBlockComment
    if (state.skip) continue

    if (!enumStartRe.test(text)) continue

    // Collect enum body lines until closing brace at same indent
    const enumStartLine = num
    const bodyLines: { num: number; text: string }[] = []
    let braceDepth = 0
    let started = false

    for (let j = i; j < lines.length; j++) {
      const ln = lines[j].text
      if (j === i) {
        started = true
        braceDepth = (ln.match(/\{/g) ?? []).length
      }
      if (started) {
        bodyLines.push({ num: lines[j].num, text: ln })
        braceDepth += (ln.match(/\{/g) ?? []).length - (ln.match(/\}/g) ?? []).length
        if (braceDepth <= 0) break
      }
    }

    let smallVariantCount = 0
    let largeVariantCount = 0
    let firstLargeLine = 0

    for (const bl of bodyLines) {
      const trimmed = bl.text.trim()
      if (!trimmed) continue
      if (trimmed.startsWith('//') || trimmed.startsWith('/*')) continue
      // Variant declaration starts at column 0-ish of the body after a comma
      const isVariantStart = /^\s*\w+\s*([(\{]|,|$)/.test(trimmed)
      if (!isVariantStart) continue

      const hasLarge = largeTypeRe.test(trimmed)
      if (hasLarge) {
        largeVariantCount++
        if (firstLargeLine === 0) firstLargeLine = bl.num
      } else if (!trimmed.includes('(') && !trimmed.includes('{')) {
        smallVariantCount++
      }
    }

    if (largeVariantCount > 0 && smallVariantCount > 0) {
      diagnostics.push(
        makeDiagnostic(
          filePath,
          'rust-deep/large-enum-variant',
          'warning',
          'Enum has a variant that is much larger than others — consider boxing it',
          'Large enum variants bloat every enum value. Box the large payload or use indirection to reduce size.',
          firstLargeLine || enumStartLine,
          1,
          {
            fixable: false,
            suggestion: {
              type: 'refactor',
              text: 'Box::new(payload)',
              confidence: 0.6,
              reason: 'Boxing the large variant makes the enum size equal to the size of a pointer for that variant.',
            },
          },
        ),
      )
    }
  }

  return diagnostics
}

// ── Rule 6: wildcard-catch ───────────────────────────────
// Catch-all `_` in a match without explicit ignore handling.

function detectWildcardCatch(
  filePath: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const wildcardRe = /\b_\s*(?:\{[^}]*\}|=>)/
  const matchStartRe = /\bmatch\s+/
  let inBlockComment = false
  let inMatchBlock = false

  for (const { num, text } of lines) {
    const state = checkCommentState(text, inBlockComment)
    inBlockComment = state.inBlockComment
    if (state.skip) continue

    if (matchStartRe.test(text)) inMatchBlock = true
    if (inMatchBlock && text.trim() === '}') inMatchBlock = false

    if (!inMatchBlock) continue

    const match = wildcardRe.exec(text)
    if (!match) continue
    const col = match.index
    if (isInsideMacroOrString(text, col)) continue

    diagnostics.push(
      makeDiagnostic(
        filePath,
        'rust-deep/wildcard-catch',
        'warning',
        'Catch-all `_` in match may silently ignore unexpected cases',
        'Use explicit match arms for expected variants, or add a comment explaining why the wildcard is safe.',
        num,
        col + 1,
        {
          fixable: false,
          suggestion: {
            type: 'refactor',
            text: 'VariantName => { /* handle explicitly */ }',
            confidence: 0.5,
            reason: 'Explicit handling prevents silently dropping new variants during refactoring.',
          },
        },
      ),
    )
  }

  return diagnostics
}

// ── Rule 7: unsafe-usage ─────────────────────────────────
// unsafe block without a preceding SAFETY comment.

function detectUnsafeUsage(
  filePath: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const unsafeRe = /\bunsafe\s*\{/
  let inBlockComment = false

  for (let i = 0; i < lines.length; i++) {
    const { num, text } = lines[i]
    const state = checkCommentState(text, inBlockComment)
    inBlockComment = state.inBlockComment
    if (state.skip) continue

    const match = unsafeRe.exec(text)
    if (!match) continue
    const col = match.index
    if (isInsideMacroOrString(text, col)) continue

    const prevLine = i > 0 ? lines[i - 1].text : ''
    const hasSafetyComment = /\/\/\s*SAFETY[:\s]/i.test(prevLine) || /\/\*\s*SAFETY[:\s]/i.test(prevLine)
    if (hasSafetyComment) continue

    diagnostics.push(
      makeDiagnostic(
        filePath,
        'rust-deep/unsafe-usage',
        'error',
        'unsafe block without a safety comment',
        'Document why this unsafe block is sound with a // SAFETY: ... comment above it.',
        num,
        col + 1,
        {
          fixable: true,
          suggestion: {
            type: 'insert',
            text: '// SAFETY: <explain why this unsafe block is sound>\n',
            confidence: 0.9,
            reason: 'Rust requires explicit reasoning for unsafe blocks; documenting the invariant helps reviewers and future maintainers.',
          },
        },
      ),
    )
  }

  return diagnostics
}

// ── Rule 8: expect-in-prod ───────────────────────────────

function detectExpectInProd(
  filePath: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const re = /\.expect\s*\(/
  let inBlockComment = false

  for (const { num, text } of lines) {
    const state = checkCommentState(text, inBlockComment)
    inBlockComment = state.inBlockComment
    if (state.skip) continue

    const match = re.exec(text)
    if (!match) continue
    const col = match.index
    if (isInsideMacroOrString(text, col)) continue

    const isTestContext = text.includes('#[test]') || filePath.includes('/tests/') || isTestFile(filePath)
    if (isTestContext) continue

    diagnostics.push(
      makeDiagnostic(
        filePath,
        'rust-deep/expect-in-prod',
        'warning',
        '.expect() in production code can panic with a generic message',
        'Prefer match, if let, or unwrap_or_else() with a contextual error message.',
        num,
        col + 1,
        {
          fixable: true,
          suggestion: {
            type: 'replace',
            text: '.unwrap_or_else(|e| { /* handle error */ })',
            confidence: 0.6,
            reason: 'unwrap_or_else() lets you log or convert the error instead of panicking.',
          },
        },
      ),
    )
  }

  return diagnostics
}

// ── Rule 9: redundant-clone ────────────────────────────────
// Heuristic: .clone() on the final expression of a statement or a value that is
// dropped immediately after. This is intentionally conservative.

function detectRedundantClone(
  filePath: string,
  lines: { num: number; text: string }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const cloneRe = /\.clone\s*\(\)/
  let inBlockComment = false

  for (const { num, text } of lines) {
    const state = checkCommentState(text, inBlockComment)
    inBlockComment = state.inBlockComment
    if (state.skip) continue

    const match = cloneRe.exec(text)
    if (!match) continue
    const col = match.index
    if (isInsideMacroOrString(text, col)) continue

    const after = text.slice(col + match[0].length).trim()
    // .clone() at end of statement or followed by semicolon only
    const isDroppingContext = after === ';' || after === '' || after === '}'

    if (!isDroppingContext) continue

    diagnostics.push(
      makeDiagnostic(
        filePath,
        'rust-deep/redundant-clone',
        'warning',
        '.clone() on a value that is about to be dropped may be redundant',
        'If the clone is the last use and the value is not borrowed, pass ownership without cloning.',
        num,
        col + 1,
        {
          fixable: true,
          suggestion: {
            type: 'delete',
            text: '',
            confidence: 0.5,
            reason: 'Removing the clone and moving the value can reduce allocations when the original is no longer needed.',
          },
        },
      ),
    )
  }

  return diagnostics
}

// ── Engine entry point ───────────────────────────────────

export const rustDeepEngine: Engine = {
  name: 'rust-deep' as const,
  description: 'Rust-specific AI slop and quality analysis (unwrap, todo!, clone-on-copy, unsafe, match wildcards, large enum variants)',
  supportedLanguages: ['rust'],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now()

    const files =
      context.files?.length && context.files.some((f) => isRustFile(f))
        ? context.files.filter((f) => isRustFile(f))
        : await collectRustFiles(context.rootDirectory, context.config.exclude)

    const diagnostics: Diagnostic[] = []

    for (const filePath of files) {
      const content = await readFileContent(filePath)
      const lines = toLines(content)
      const relPath = relativePath(context.rootDirectory, filePath)

      diagnostics.push(
        ...detectUnwrapInProd(relPath, lines),
        ...detectTodoMacro(relPath, lines),
        ...detectUnimplementedMacro(relPath, lines),
        ...detectCloneOnCopy(relPath, lines),
        ...detectLargeEnumVariant(relPath, lines),
        ...detectWildcardCatch(relPath, lines),
        ...detectUnsafeUsage(relPath, lines),
        ...detectExpectInProd(relPath, lines),
        ...detectRedundantClone(relPath, lines),
      )
    }

    return {
      engine: 'rust-deep',
      diagnostics,
      elapsed: performance.now() - start,
      skipped: false,
    }
  },
}
