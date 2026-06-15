// ── Type-Safety Engine Rules ────────────────────────────────────────────────
// Rule detection functions for the type-safety engine.

import type { Diagnostic } from '../../types/index.js'
import {
  capitalize,
  columnForIndex,
  isJsxFile,
  isTypeScriptFile,
  type AsAnyContext,
} from './helpers.js'

/**
 * Analyze the surrounding context of an `as any` cast and produce
 * a CONTEXT-AWARE suggestion. This is the crown jewel of this engine.
 */
function analyzeAsAnyContext(
  lineText: string,
  matchIndex: number,
  surroundingLines: { before: string[]; after: string[] },
): AsAnyContext {
  const before = surroundingLines.before.join('\n').toLowerCase()
  const after = surroundingLines.after.join('\n').toLowerCase()
  const full = `${before}\n${lineText.toLowerCase()}\n${after}`

  // ── Prisma / Drizzle query context ───────────────────────────────────
  const prismaDrizzlePatterns = [
    /\.\s*findFirst\s*\(/,
    /\.\s*findMany\s*\(/,
    /\.\s*findUnique\s*\(/,
    /\.\s*create\s*\(/,
    /\.\s*update\s*\(/,
    /\.\s*delete\s*\(/,
    /\.\s*upsert\s*\(/,
    /\.\s*query\s*\(/,
    /\.\s*execute\s*\(/,
    /prisma\./,
    /drizzle\./,
    /\.\s*select\s*\(/,
    /\.\s*from\s*\(/,
    /\.\s*where\s*\(/,
    /db\.\s*\(/,
  ]

  const isOrmQuery = prismaDrizzlePatterns.some((p) => p.test(full))
  if (isOrmQuery) {
    return {
      severity: 'suggestion',
      rule: 'types/as-any-orm',
      message: '`as any` cast after ORM query — common Drizzle/Prisma workaround',
      help: 'ORMs like Drizzle sometimes produce incomplete types. Consider defining the return type explicitly instead of casting to any.',
      suggestion: {
        type: 'refactor',
        text: 'as Awaited<ReturnType<typeof db.query.table>>',
        confidence: 0.6,
        reason:
          'ORM query return types can be inferred. Use ReturnType or define a specific row interface instead of `as any`. This is a known Drizzle workaround but should be typed explicitly.',
      },
    }
  }

  // ── window / document context ─────────────────────────────────────────
  const windowDocPatterns = [
    /\bwindow\b/,
    /\bdocument\b/,
    /\bnavigator\b/,
    /\bglobalThis\b/,
  ]

  const isWindowDoc = windowDocPatterns.some((p) => p.test(lineText))
  if (isWindowDoc) {
    const varMatch = lineText.match(
      /(\w+)\s*(?:\.\s*\w+\s*)*=\s*.*window.*as\s+any/,
    )
    const varName = varMatch?.[1] ?? 'CustomWindow'

    return {
      severity: 'warning',
      rule: 'types/as-any-window',
      message: '`as any` cast on window/document — use interface extension instead',
      help: `Declare an extended Window interface to add custom properties instead of casting to any.`,
      suggestion: {
        type: 'insert',
        text: `interface ${varName.replace(/window/i, 'XWindow')} extends Window {\n  // Add your custom properties here\n}\n\n// Then use: window as ${varName.replace(/window/i, 'XWindow')}`,
        confidence: 0.85,
        reason:
          'Extending the Window interface is the TypeScript-idiomatic way to add custom globals. It preserves type safety for all standard properties while allowing your extensions.',
      },
    }
  }

  // ── JSON.parse context ────────────────────────────────────────────────
  const jsonParsePattern = /json\s*\.\s*parse\s*\(/i
  if (jsonParsePattern.test(full) || jsonParsePattern.test(lineText)) {
    return {
      severity: 'warning',
      rule: 'types/as-any-json-parse',
      message: '`as any` cast on JSON.parse result — use runtime validation instead',
      help: 'JSON.parse returns `any` by default. Instead of casting, use a validation library to ensure the data matches your expected shape at runtime.',
      suggestion: {
        type: 'refactor',
        text: `import { z } from "zod";\nconst MySchema = z.object({ /* ... */ });\nconst data = MySchema.parse(JSON.parse(raw));`,
        confidence: 0.8,
        reason:
          'zod (or io-ts/valibot) validates at runtime AND gives you a typed result. This eliminates both the `any` and the risk of malformed data slipping through.',
      },
    }
  }

  // ── Function parameter context ────────────────────────────────────────
  const funcParamPattern =
    /(?:function\s*\w*\s*\(|(?:const|let|var)\s+\w+\s*=\s*(?:\([^)]*\)|[^=]+)=>)\s*[^)]*as\s+any/
  const isFuncParam =
    funcParamPattern.test(lineText) ||
    /(?:param|arg|option|config|ctx|event)\w*\s*:\s*any/i.test(lineText)

  if (isFuncParam) {
    const paramMatch = lineText.match(
      /(\w+)\s*(?::\s*any|:\s*unknown|\.\.\.)[^=]*as\s+any/,
    )
    const paramName = paramMatch?.[1] ?? 'params'

    return {
      severity: 'warning',
      rule: 'types/as-any-param',
      message: `\`as any\` cast on function parameter — define an interface for \`${paramName}\``,
      help: `Instead of casting parameters to any, define an interface that describes the expected shape.`,
      suggestion: {
        type: 'refactor',
        text: `interface ${capitalize(paramName)}Params {\n  // Define expected properties\n}\n\n// Use: (${paramName}: ${capitalize(paramName)}Params) => ...`,
        confidence: 0.7,
        reason:
          'Explicit interfaces on function parameters provide documentation, IDE autocompletion, and compile-time safety. `as any` removes all of these benefits.',
      },
    }
  }

  // ── Generic / default fallback ────────────────────────────────────────
  return {
    severity: 'warning',
    rule: 'types/as-any',
    message: 'Unsafe `as any` cast — disables type checking',
    help: 'Replace `as any` with a concrete type. If the type is truly unknown, use `unknown` and narrow with type guards.',
    suggestion: {
      type: 'replace',
      text: 'as unknown', // at least forces narrowing
      confidence: 0.5,
      reason:
        '`unknown` is the type-safe alternative to `any` — it requires narrowing before use, preventing accidental property access on the wrong type. If you know the shape, declare an interface instead.',
    },
  }
}

/**
 * Detect `as any` casts with context-aware suggestions.
 * Rule: types/as-any, types/as-any-orm, types/as-any-window,
 *       types/as-any-json-parse, types/as-any-param
 */
export function detectAsAny(
  lines: string[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const regex = /\bas\s+any\b/g

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let match: RegExpExecArray | null

    while ((match = regex.exec(line)) !== null) {
      const col = columnForIndex(line, match.index)

      const before = lines.slice(Math.max(0, i - 5), i)
      const after = lines.slice(i + 1, Math.min(lines.length, i + 6))

      const ctx = analyzeAsAnyContext(line, match.index, {
        before,
        after,
      })

      diagnostics.push({
        filePath,
        engine: 'type-safety',
        rule: ctx.rule,
        severity: ctx.severity,
        message: ctx.message,
        help: ctx.help,
        line: i + 1,
        column: col,
        category: 'types',
        fixable: false,
        suggestion: ctx.suggestion,
      })
    }
  }

  return diagnostics
}

/**
 * Detect double type assertions: `as unknown as X`
 * Rule: types/double-assertion
 */
export function detectDoubleAssertions(
  lines: string[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const regex = /\bas\s+unknown\s+as\s+(\w+)/g

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let match: RegExpExecArray | null

    while ((match = regex.exec(line)) !== null) {
      const targetTypeName = match[1]
      const col = columnForIndex(line, match.index)

      diagnostics.push({
        filePath,
        engine: 'type-safety',
        rule: 'types/double-assertion',
        severity: 'warning',
        message: `Double type assertion \`as unknown as ${targetTypeName}\` — use a named interface instead`,
        help: `Double assertions bypass TypeScript's safety checks. Define an interface (like the YaWindow pattern) and cast once to it.`,
        line: i + 1,
        column: col,
        category: 'types',
        fixable: true,
        suggestion: {
          type: 'refactor',
          text: `interface ${targetTypeName.startsWith('I') ? targetTypeName : `I${targetTypeName}`} {\n  // Define the expected shape\n}\n\n// Then use: ... as I${targetTypeName}`,
          confidence: 0.75,
          reason: `A named interface with a single cast is safer than \`as unknown as ${targetTypeName}\`. Double assertions hide real type mismatches — a named interface forces you to think about the actual shape.`,
        },
      })
    }
  }

  return diagnostics
}

/**
 * Detect missing return type annotations on functions in TS files.
 * Skip simple arrow functions in JSX/TSX files.
 * Rule: types/missing-return-type
 */
export function detectMissingReturnTypes(
  lines: string[],
  filePath: string,
): Diagnostic[] {
  if (!isTypeScriptFile(filePath)) return []

  const diagnostics: Diagnostic[] = []
  const isJsx = isJsxFile(filePath)

  const funcPatterns = [
    // Named function: function foo(
    /function\s+(\w+)\s*\([^)]*\)\s*\{/,
    // Arrow with block body: const foo = (...) => {
    /(?:const|let|var)\s+(\w+)\s*=\s*\([^)]*\)\s*=>\s*\{/,
    // Arrow with block body (single param, no parens): const foo = x => {
    /(?:const|let|var)\s+(\w+)\s*=\s*\w+\s*=>\s*\{/,
  ]

  // For non-JSX files, also check exported functions
  if (!isJsx) {
    funcPatterns.push(
      // export function
      /export\s+(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/,
      // export default function
      /export\s+default\s+(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/,
    )
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Skip single-line arrow functions in JSX (they're usually inline callbacks)
    if (isJsx && /^\s*(?:const|let)\s+\w+\s*=\s*\([^)]*\)\s*=>\s*[^{]/.test(line)) {
      continue
    }

    for (const pattern of funcPatterns) {
      const match = pattern.exec(trimmed)
      if (!match) continue

      const funcName = match[1] || 'anonymous'

      // Check if there's already a return type annotation
      const hasReturnType =
        /:\s*\w+(\[\])?\s*(=>|\{)/.test(trimmed) ||
        /:\s*\w+<[^>]+>\s*(=>|\{)/.test(trimmed)

      if (hasReturnType) continue

      // Skip constructor / lifecycle methods in classes
      if (/^(constructor|render|componentDidMount|useEffect|useState)/.test(funcName)) {
        continue
      }

      diagnostics.push({
        filePath,
        engine: 'type-safety',
        rule: 'types/missing-return-type',
        severity: 'info',
        message: `Function \`${funcName}\` has no explicit return type annotation`,
        help: "Add an explicit return type to document the function's contract and catch mismatches at compile time.",
        line: i + 1,
        column: trimmed.indexOf(funcName) + 1,
        category: 'types',
        fixable: true,
        suggestion: {
          type: 'refactor',
          text: ': /* infer return type */ = ',
          confidence: 0.4,
          reason:
            'Explicit return types serve as documentation and catch accidental return-type changes. Hover over the function in your IDE to see the inferred type, then add it explicitly.',
        },
      })

      break // only one diagnostic per line
    }
  }

  return diagnostics
}

/**
 * Detect @ts-ignore and @ts-expect-error comments.
 * Rule: types/ts-suppress
 */
export function detectTsSuppress(
  lines: string[],
  filePath: string,
): Diagnostic[] {
  if (!isTypeScriptFile(filePath)) return []

  const diagnostics: Diagnostic[] = []
  const patterns: Array<{ regex: RegExp; label: string }> = [
    { regex: /\/\/\s*@ts-ignore/, label: '@ts-ignore' },
    { regex: /\/\/\s*@ts-expect-error/, label: '@ts-expect-error' },
  ]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    for (const { regex, label } of patterns) {
      const match = regex.exec(line)
      if (!match) continue

      const col = columnForIndex(line, match.index)

      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : ''
      const suppressedHint = nextLine
        ? ` The suppressed line is: \`${nextLine}\``
        : ''

      diagnostics.push({
        filePath,
        engine: 'type-safety',
        rule: 'types/ts-suppress',
        severity: 'warning',
        message: `\`${label}\` suppresses a TypeScript error — fix the underlying type issue instead`,
        help: `Type-suppression comments hide real problems.${suppressedHint} Fix the type error on the next line and remove this comment.`,
        line: i + 1,
        column: col,
        category: 'types',
        fixable: true,
        suggestion: {
          type: 'delete',
          text: `// Remove ${label} and fix the type error on the next line`,
          confidence: 0.7,
          reason: `${label} hides type errors that could cause runtime failures. Fix the underlying type mismatch instead of suppressing it. If the error is in a dependency's type definitions, use \`declare module\` or a local override.`,
        },
      })
    }
  }

  return diagnostics
}

/**
 * Detect non-null assertions: `x!` operator.
 * Rule: types/non-null-assertion
 */
export function detectNonNullAssertions(
  lines: string[],
  filePath: string,
): Diagnostic[] {
  if (!isTypeScriptFile(filePath)) return []

  const diagnostics: Diagnostic[] = []
  const regex = /(\w+)!(?![=:(])/g

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue

    let match: RegExpExecArray | null
    while ((match = regex.exec(line)) !== null) {
      const identifier = match[1]
      const col = columnForIndex(line, match.index + identifier.length)

      const beforeMatch = line.substring(0, match.index)
      const singleQuotes = (beforeMatch.match(/'/g) || []).length
      const doubleQuotes = (beforeMatch.match(/"/g) || []).length
      if (singleQuotes % 2 === 1 || doubleQuotes % 2 === 1) continue

      if (beforeMatch.includes('`') && !beforeMatch.includes('}')) continue

      diagnostics.push({
        filePath,
        engine: 'type-safety',
        rule: 'types/non-null-assertion',
        severity: 'warning',
        message: `Non-null assertion \`${identifier}!\` — this assertion is unchecked at runtime`,
        help: `Non-null assertions (\`!\`) tell TypeScript to assume a value is non-null, but this isn't checked at runtime. Add an explicit null check instead.`,
        line: i + 1,
        column: col,
        category: 'types',
        fixable: true,
        suggestion: {
          type: 'replace',
          text: `if (${identifier} != null) { /* use ${identifier} safely */ }`,
          confidence: 0.65,
          reason:
            'An explicit null check provides runtime safety AND narrows the type in TypeScript. The `!` operator only satisfies the compiler — it can cause runtime errors if the value is actually null/undefined.',
        },
      })
    }
  }

  return diagnostics
}

/**
 * Detect `any` used as a generic type parameter.
 * Rule: types/generic-any
 */
export function detectGenericAny(
  lines: string[],
  filePath: string,
): Diagnostic[] {
  if (!isTypeScriptFile(filePath)) return []

  const diagnostics: Diagnostic[] = []

  const genericPatterns: Array<{
    regex: RegExp
    construct: string
    suggestion: string
  }> = [
    { regex: /Array\s*<\s*any\s*>/g, construct: 'Array<any>', suggestion: 'unknown[]' },
    { regex: /ReadonlyArray\s*<\s*any\s*>/g, construct: 'ReadonlyArray<any>', suggestion: 'readonly unknown[]' },
    { regex: /Promise\s*<\s*any\s*>/g, construct: 'Promise<any>', suggestion: 'Promise<unknown>' },
    { regex: /Record\s*<\s*([^,]+)\s*,\s*any\s*>/g, construct: 'Record<K, any>', suggestion: 'Record<K, unknown>' },
    { regex: /Map\s*<\s*([^,]+)\s*,\s*any\s*>/g, construct: 'Map<K, any>', suggestion: 'Map<K, unknown>' },
    { regex: /Set\s*<\s*any\s*>/g, construct: 'Set<any>', suggestion: 'Set<unknown>' },
    { regex: /Partial\s*<\s*any\s*>/g, construct: 'Partial<any>', suggestion: 'Partial<Record<string, unknown>>' },
    { regex: /Omit\s*<\s*any\s*,/g, construct: 'Omit<any, K>', suggestion: 'Omit<Record<string, unknown>, K>' },
    { regex: /Pick\s*<\s*any\s*,/g, construct: 'Pick<any, K>', suggestion: 'Pick<Record<string, unknown>, K>' },
    { regex: /ReturnType\s*<\s*any\s*>/g, construct: 'ReturnType<any>', suggestion: 'ReturnType<typeof fn>' },
    { regex: /(\w+)\s*<\s*any\s*>/g, construct: 'T<any>', suggestion: 'T<unknown>' },
  ]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue

    for (const pattern of genericPatterns) {
      let match: RegExpExecArray | null
      while ((match = pattern.regex.exec(line)) !== null) {
        const col = columnForIndex(line, match.index)

        let suggestionText: string
        let reason: string

        if (pattern.construct === 'Record<K, any>') {
          const keyType = match[1]?.trim() ?? 'string'
          suggestionText = `Record<${keyType}, unknown>`
          reason = `Using \`any\` as the value type in Record allows unrestricted access. Use \`unknown\` to require narrowing before use, or define a specific value interface.`
        } else if (pattern.construct === 'Map<K, any>') {
          const keyType = match[1]?.trim() ?? 'string'
          suggestionText = `Map<${keyType}, unknown>`
          reason = `Using \`any\` as the value type in Map allows unrestricted access. Use \`unknown\` to require narrowing, or define a specific value interface.`
        } else if (pattern.construct === 'Omit<any, K>' || pattern.construct === 'Pick<any, K>') {
          const constructName = pattern.construct.startsWith('Omit') ? 'Omit' : 'Pick'
          suggestionText = `${constructName}<Record<string, unknown>, K>`
          reason = `Using \`any\` as the base type in ${constructName} makes the result essentially untyped. Define a proper interface as the base.`
        } else if (pattern.construct === 'T<any>') {
          const typeName = match[1] ?? 'T'
          suggestionText = `${typeName}<unknown>`
          reason = `Using \`any\` as a generic parameter defeats the purpose of generics. Use \`unknown\` or a specific type.`
        } else {
          suggestionText = pattern.suggestion
          reason = `Using \`any\` as a generic type parameter disables all type checking for that parameter. Use \`unknown\` to require narrowing, or define a specific type.`
        }

        const alreadyReported = diagnostics.some(
          (d) => d.line === i + 1 && d.column === col,
        )
        if (alreadyReported) continue

        diagnostics.push({
          filePath,
          engine: 'type-safety',
          rule: 'types/generic-any',
          severity: 'warning',
          message: `\`${match[0]}\` uses \`any\` as a generic type parameter`,
          help: `Replace \`any\` with a concrete type or \`unknown\` to preserve type safety.`,
          line: i + 1,
          column: col,
          category: 'types',
          fixable: true,
          suggestion: {
            type: 'replace',
            text: suggestionText,
            confidence: 0.7,
            reason,
          },
        })
      }
    }
  }

  return diagnostics
}
