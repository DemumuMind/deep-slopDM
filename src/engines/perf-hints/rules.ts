// ── Perf-Hints Engine Rules ────────────────────────────────────────────────
// Rule detection functions for the perf-hints engine.

import type { Diagnostic } from '../../types/index.js'
import {
  type BlockRange,
  type NumberedLine,
  buildSyncInAsyncSuggestion,
  contentAroundLine,
  describeLoopKind,
  isInsideBlock,
  makeDiagnostic,
} from './helpers.js'

// ── Rule 1: N+1 query pattern ───────────────────────────────────────────

export function detectNPlusOne(
  lines: NumberedLine[],
  filePath: string,
  blocks: BlockRange[],
  seenKeys: Set<string>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const strictLoopKinds = new Set<BlockRange['kind']>(['for', 'while', 'do'])
  const dbCallRe = /\.(query|execute|find|findOne|findMany|insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|raw|run|exec)\s*\(/

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].text.trim()

    if (dbCallRe.test(trimmed)) {
      const enclosingLoop = isInsideBlock(blocks, i, strictLoopKinds)
      if (enclosingLoop) {
        const hasAwait = /\bawait\b/.test(trimmed)
        const key = `${filePath}:${enclosingLoop.startIdx}:perf-hints/n-plus-one`
        if (!seenKeys.has(key)) {
          seenKeys.add(key)
          diagnostics.push(
            makeDiagnostic({
              filePath,
              rule: 'perf-hints/n-plus-one',
              message: `Database call inside ${describeLoopKind(enclosingLoop.kind)} — potential N+1 query pattern`,
              line: lines[i].num,
              severity: 'info',
              help: 'Batch database queries outside the loop or use a single query with IN clause to avoid N+1 round trips',
              fixable: false,
              suggestion: {
                type: 'refactor',
                text: hasAwait
                  ? "// Collect IDs, then batch: const results = await db.query('SELECT * FROM t WHERE id IN (?)', [ids])"
                  : '// Batch the query outside the loop instead of calling per iteration',
                confidence: 0.75,
                reason: 'Performing I/O on every loop iteration causes N+1 round trips; batching reduces this to 1',
              },
              detail: {
                loopKind: enclosingLoop.kind,
                loopHeaderLine: enclosingLoop.headerLine,
                hasAwait,
                isDbCall: true,
              },
            }),
          )
        }
      }
    }
  }

  return diagnostics
}

// ── Rule 2: React component defined inside another component ────────────

export function detectReactMissingMemo(
  lines: NumberedLine[],
  filePath: string,
  blocks: BlockRange[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const isReactFile = /\.(tsx|jsx)$/.test(filePath)
  if (!isReactFile) return diagnostics

  const functionKinds = new Set<BlockRange['kind']>(['sync-function', 'async-function'])
  const pascalFnRe = /^(?:const|let|function)\s+([A-Z][a-zA-Z0-9]*)\s*(?:=\s*(?:\([^)]*\)|[\w]*)\s*=>|[\s]*\()/

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].text.trim().match(pascalFnRe)
    if (!match) continue

    const componentName = match[1]

    const enclosingFn = isInsideBlock(blocks, i, functionKinds)
    if (!enclosingFn) continue

    const jsxAhead = contentAroundLine(lines, i, 15)
    const hasJsxReturn = /<\s*[A-Za-z][A-Za-z0-9]*(?:\s[^>]*)?\/?>/.test(jsxAhead) ||
                         /React\.createElement/.test(jsxAhead)

    if (!hasJsxReturn) continue

    diagnostics.push(
      makeDiagnostic({
        filePath,
        rule: 'perf-hints/react-missing-memo',
        message: `Component \`${componentName}\` is defined inside another component — recreated on every render`,
        line: lines[i].num,
        severity: 'info',
        help: `Move \`${componentName}\` outside the parent component or wrap with useMemo to avoid re-creation on every render`,
        fixable: false,
        suggestion: {
          type: 'refactor',
          text: `// Move ${componentName} outside the parent component, or:\n// const ${componentName} = useMemo(() => (...) , [])`,
          confidence: 0.8,
          reason: 'Inner component definitions create new function references on every parent render, causing unnecessary child re-renders',
        },
        detail: {
          componentName,
          parentHeaderLine: enclosingFn.headerLine,
        },
      }),
    )
  }

  return diagnostics
}

// ── Rule 3: Synchronous file I/O inside async functions ─────────────────

export function detectSyncInAsync(
  lines: NumberedLine[],
  filePath: string,
  blocks: BlockRange[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const asyncKinds = new Set<BlockRange['kind']>(['async-function'])

  const isCliFile = /(?:^|\\|\/)cli(?:\\|\/|[-_.])/i.test(filePath) || /(?:^|\\|\/)cli\./i.test(filePath)

  const syncFsRe = /\b(readFileSync|writeFileSync|appendFileSync|existsSync|mkdirSync|rmdirSync|unlinkSync|renameSync|copyFileSync|readdirSync|statSync|lstatSync|fstatSync|accessSync|readlinkSync|symlinkSync|chmodSync|chownSync|utimesSync|realpathSync|mkdtempSync|truncateSync|openSync|closeSync|readSync|writeSync|fsyncSync|watchFile|unwatchFile)\s*\(/

  const cliWhitelist = new Set(['readFileSync', 'writeFileSync'])

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].text.trim()
    const match = trimmed.match(syncFsRe)
    if (!match) continue

    const methodName = match[1]

    if (isCliFile && cliWhitelist.has(methodName)) continue

    const enclosingAsync = isInsideBlock(blocks, i, asyncKinds)
    if (!enclosingAsync) continue

    const asyncName = methodName.replace(/Sync$/, '')

    diagnostics.push(
      makeDiagnostic({
        filePath,
        rule: 'perf-hints/sync-in-async',
        message: `Synchronous \`${methodName}\` inside async function — blocks the event loop`,
        line: lines[i].num,
        severity: 'warning',
        help: `Replace \`${methodName}\` with async \`${asyncName}\` to avoid blocking the event loop`,
        fixable: true,
        suggestion: buildSyncInAsyncSuggestion(
          lines[i].text,
          methodName,
          asyncName,
          lines[i].num,
        ),
        detail: {
          syncMethod: methodName,
          asyncMethod: asyncName,
          asyncHeaderLine: enclosingAsync.headerLine,
        },
      }),
    )
  }

  return diagnostics
}

// ── Rule 4: Large allocation inside loops ───────────────────────────────

export function detectLargeLoopAllocation(
  lines: NumberedLine[],
  filePath: string,
  blocks: BlockRange[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const loopKinds = new Set<BlockRange['kind']>(['for', 'while', 'do', 'forEach', 'map'])

  const typedArrayTypes = new Set([
    'Float32Array', 'Float64Array', 'Int8Array', 'Int16Array', 'Int32Array',
    'Uint8Array', 'Uint16Array', 'Uint32Array', 'Uint8ClampedArray',
    'BigInt64Array', 'BigUint64Array',
  ])

  const skipTypes = new Set(['Map', 'Set', 'WeakMap', 'WeakSet'])

  const allocRe = /\bnew\s+(Array|Map|Set|WeakMap|WeakSet|Float32Array|Float64Array|Int8Array|Int16Array|Int32Array|Uint8Array|Uint16Array|Uint32Array|Uint8ClampedArray|BigInt64Array|BigUint64Array)\s*\(/

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].text.trim()

    const arrayMatch = trimmed.match(allocRe)
    if (!arrayMatch) continue

    const allocType = arrayMatch[1]

    const enclosingLoop = isInsideBlock(blocks, i, loopKinds)
    if (!enclosingLoop) continue

    if (skipTypes.has(allocType)) continue

    const loopDesc = describeLoopKind(enclosingLoop.kind)

    if (allocType === 'Array') {
      const sizeMatch = trimmed.match(/\bnew\s+Array\s*\(\s*(\d+)\s*\)/)
      if (!sizeMatch) continue
      const size = parseInt(sizeMatch[1], 10)
      if (size <= 100) continue

      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'perf-hints/large-loop-allocation',
          message: `\`new Array(${size})\` allocation inside ${loopDesc} — consider pre-allocating outside the loop`,
          line: lines[i].num,
          severity: 'suggestion',
          help: 'Move the array allocation outside the loop and re-use it, or use .push() on a pre-allocated array',
          fixable: false,
          suggestion: {
            type: 'refactor',
            text: `// const arr = new Array(${size}); // outside loop\n// arr.fill(0); // reuse per iteration`,
            confidence: 0.5,
            reason: 'Repeated large array allocations inside loops create GC pressure; pre-allocating outside the loop is more efficient',
          },
          detail: {
            allocType,
            loopKind: enclosingLoop.kind,
            loopHeaderLine: enclosingLoop.headerLine,
            hasSizeArg: true,
            arraySize: size,
          },
        }),
      )
    } else if (typedArrayTypes.has(allocType)) {
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'perf-hints/large-loop-allocation',
          message: `\`new ${allocType}()\` allocation inside ${loopDesc} — consider pre-allocating outside the loop`,
          line: lines[i].num,
          severity: 'suggestion',
          help: `Move the ${allocType} allocation outside the loop to reduce GC pressure`,
          fixable: false,
          suggestion: {
            type: 'refactor',
            text: `// const buf = new ${allocType}(...); // allocate once outside the loop`,
            confidence: 0.5,
            reason: 'Repeated typed array allocations inside loops create GC pressure; pre-allocating outside the loop is more efficient',
          },
          detail: {
            allocType,
            loopKind: enclosingLoop.kind,
            loopHeaderLine: enclosingLoop.headerLine,
            hasSizeArg: false,
          },
        }),
      )
    }
  }

  return diagnostics
}

// ── Rule 5: Unnecessary await on non-Promise values (DISABLED) ──────────

export function detectUnnecessaryAwait(
  _content: string,
  _filePath: string,
): Diagnostic[] {
  return []
}

// ── Rule 6: String concatenation in loops ────────────────────────────────

export function detectStringConcatInLoop(
  lines: NumberedLine[],
  filePath: string,
  blocks: BlockRange[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const loopKinds = new Set<BlockRange['kind']>(['for', 'while', 'do', 'forEach', 'map'])

  const templateConcatRe = /\b(\w+)\s*\+=\s*`/
  const anyConcatRe = /\b(\w+)\s*\+=\s*["'`]/

  // Visual/TUI variables are building rendered output (progress bars, prompts,
  // SVG paths, lines) and are not performance-critical string concatenation.
  const visualVarNames = new Set(['bar', 'prompt', 'output', 'line', 'path', 'result'])

  const isTuiOrPromptFile = /tui|prompt/i.test(filePath)
  const isVisualVariable = (varName: string): boolean => visualVarNames.has(varName)

  const shouldSkip = (varName: string): boolean =>
    isTuiOrPromptFile || isVisualVariable(varName)

  // First pass: count concatenations per variable per loop block
  const concatCounts = new Map<string, number>()
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].text.trim()
    const match = trimmed.match(anyConcatRe)
    if (!match) continue
    const varName = match[1]
    if (shouldSkip(varName)) continue
    const enclosingLoop = isInsideBlock(blocks, i, loopKinds)
    if (!enclosingLoop) continue
    const key = `${varName}:${enclosingLoop.startIdx}`
    concatCounts.set(key, (concatCounts.get(key) ?? 0) + 1)
  }

  // Second pass: flag template literal concatenations or variables with 3+ concat lines
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].text.trim()
    const enclosingLoop = isInsideBlock(blocks, i, loopKinds)
    if (!enclosingLoop) continue

    // Check for template literal concatenation
    const templateMatch = trimmed.match(templateConcatRe)
    if (templateMatch) {
      const varName = templateMatch[1]
      if (shouldSkip(varName)) continue
      const loopDesc = describeLoopKind(enclosingLoop.kind)
      const lineText = lines[i].text
      const indent = lineText.match(/^(\s*)/)?.[1] ?? ''
      const rhs = trimmed.replace(new RegExp(`^${varName}\\s*\\+=\\s*`), '')
      const replacement = `${indent}${varName} = [${varName}, ${rhs}].join('')`
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'perf-hints/string-concat-in-loop',
          message: `String concatenation (\`${varName} +=\` with template literal) inside ${loopDesc} — consider using array.join() pattern`,
          line: lines[i].num,
          severity: 'warning',
          help: `Use an array to collect strings and join once after the loop, which is O(n) instead of O(n²) for repeated concatenation`,
          fixable: true,
          suggestion: {
            type: 'replace',
            text: replacement,
            range: {
              startLine: lines[i].num,
              startCol: 1,
              endLine: lines[i].num,
              endCol: lineText.length + 1,
            },
            confidence: 0.75,
            reason: 'Repeated string concatenation with += and template literals inside a loop is O(n²); using array.join() avoids repeated string reallocations.',
          },
          detail: {
            variableName: varName,
            loopKind: enclosingLoop.kind,
            loopHeaderLine: enclosingLoop.headerLine,
          },
        }),
      )
      continue
    }

    // Check for 3+ concatenations on the same variable in the same loop
    const anyMatch = trimmed.match(anyConcatRe)
    if (anyMatch) {
      const varName = anyMatch[1]
      if (shouldSkip(varName)) continue
      const key = `${varName}:${enclosingLoop.startIdx}`
      const count = concatCounts.get(key) ?? 0
      if (count >= 3) {
        const loopDesc = describeLoopKind(enclosingLoop.kind)
        const lineText = lines[i].text
        const indent = lineText.match(/^(\s*)/)?.[1] ?? ''
        const rhs = trimmed.replace(new RegExp(`^${varName}\\s*\\+=\\s*`), '')
        const replacement = `${indent}${varName} = [${varName}, ${rhs}].join('')`
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: 'perf-hints/string-concat-in-loop',
            message: `String concatenation (\`${varName} +=\`) inside ${loopDesc} — ${count} concatenations found, consider using array.join() pattern`,
            line: lines[i].num,
            severity: 'warning',
            help: `Use an array to collect strings and join once after the loop, which is O(n) instead of O(n²) for repeated concatenation`,
            fixable: true,
            suggestion: {
              type: 'replace',
              text: replacement,
              range: {
                startLine: lines[i].num,
                startCol: 1,
                endLine: lines[i].num,
                endCol: lineText.length + 1,
              },
              confidence: 0.7,
              reason: `${count} repeated string concatenations with += inside a loop is O(n²); using array.join() avoids repeated string reallocations.`,
            },
            detail: {
              variableName: varName,
              loopKind: enclosingLoop.kind,
              loopHeaderLine: enclosingLoop.headerLine,
              concatCount: count,
            },
          }),
        )
      }
    }
  }

  return diagnostics
}
