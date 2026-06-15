// ── Unreachable Code After Terminator Rule ──────────────────────────────
// Detects code after return, throw, break, or continue that can never run.

import { toLines } from '../../../utils/file-utils.js'
import { isClosingBraceLine, makeDiagnostic } from '../shared.js'

export function detectUnreachableAfterTerminator(
  content: string,
  filePath: string,
): ReturnType<typeof makeDiagnostic>[] {
  const diagnostics: ReturnType<typeof makeDiagnostic>[] = []
  const lines = toLines(content)
  const terminatorRe = /^\s*(return\b|throw\b|break\b|continue\b)/

  // Pre-compute brace depth at the START of each line
  const startDepths: number[] = []
  let depth = 0
  for (let i = 0; i < lines.length; i++) {
    startDepths.push(depth)
    for (const ch of lines[i].text) {
      if (ch === '{') depth++
      if (ch === '}') depth--
    }
  }

  // Detect ALL arrow function and anonymous function expression bodies.
  const inCallback = new Set<number>()
  const callbackMethodRe =
    /\.(forEach|map|filter|reduce|find|findIndex|some|every|flatMap|sort)\s*\(/

  for (let i = 0; i < lines.length; i++) {
    if (!callbackMethodRe.test(lines[i].text)) continue
    for (let s = i; s < Math.min(lines.length, i + 6); s++) {
      const lineText = lines[s].text
      if (
        (lineText.includes('=>') || /function\s*\(/.test(lineText)) &&
        lineText.includes('{')
      ) {
        let depthAfterLine = startDepths[s]
        for (const ch of lineText) {
          if (ch === '{') depthAfterLine++
          if (ch === '}') depthAfterLine--
        }
        if (depthAfterLine > startDepths[s]) {
          for (let mark = s + 1; mark < lines.length; mark++) {
            if (startDepths[mark] <= startDepths[s]) break
            inCallback.add(mark)
          }
        }
        break
      }
    }
  }

  // Detect ALL arrow function bodies (`=> {`)
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].text.includes('=>')) continue
    if (!/=>\s*\{/.test(lines[i].text)) continue

    let depthAfterLine = startDepths[i]
    for (const ch of lines[i].text) {
      if (ch === '{') depthAfterLine++
      if (ch === '}') depthAfterLine--
    }
    if (depthAfterLine > startDepths[i]) {
      for (let mark = i + 1; mark < lines.length; mark++) {
        if (startDepths[mark] <= startDepths[i]) break
        inCallback.add(mark)
      }
    }
  }

  // Detect catch/finally blocks
  const inCatchFinally = new Set<number>()
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].text.trim()
    if (!(/(?:^|})\s*catch\b/.test(trimmed) || /(?:^|})\s*finally\b/.test(trimmed))) continue

    let braceLineIdx = -1
    if (lines[i].text.includes('{')) {
      braceLineIdx = i
    } else {
      for (let s = i + 1; s < Math.min(lines.length, i + 3); s++) {
        if (lines[s].text.includes('{')) {
          braceLineIdx = s
          break
        }
      }
    }
    if (braceLineIdx === -1) continue

    let depthAfterLine = startDepths[braceLineIdx]
    for (const ch of lines[braceLineIdx].text) {
      if (ch === '{') depthAfterLine++
      if (ch === '}') depthAfterLine--
    }
    if (depthAfterLine > startDepths[braceLineIdx]) {
      for (let mark = braceLineIdx + 1; mark < lines.length; mark++) {
        if (startDepths[mark] <= startDepths[braceLineIdx]) break
        inCatchFinally.add(mark)
      }
    }
  }

  // Detect early-return guard patterns
  const guardReturnLines = new Set<number>()
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].text.trim()
    if (!/^if\s*\(/.test(trimmed)) continue

    let braceLineIdx = -1
    if (lines[i].text.includes('{')) {
      braceLineIdx = i
    } else {
      for (let s = i + 1; s < Math.min(lines.length, i + 3); s++) {
        if (lines[s].text.includes('{')) {
          braceLineIdx = s
          break
        }
      }
    }
    if (braceLineIdx === -1) continue

    const ifBodyStart = braceLineIdx + 1
    let ifBlockEnd = -1
    let onlyTerminators = true

    for (let j = ifBodyStart; j < lines.length; j++) {
      if (startDepths[j] <= startDepths[braceLineIdx]) {
        ifBlockEnd = j
        break
      }
      const bodyTrimmed = lines[j].text.trim()
      if (
        bodyTrimmed === '' ||
        bodyTrimmed.startsWith('//') ||
        bodyTrimmed.startsWith('/*') ||
        bodyTrimmed.startsWith('*')
      ) {
        continue
      }
      if (isClosingBraceLine(bodyTrimmed)) {
        continue
      }
      if (/^return\b|^throw\b/.test(bodyTrimmed)) {
        continue
      }
      onlyTerminators = false
    }

    if (!onlyTerminators || ifBlockEnd === -1) continue

    let nextNonEmpty = ifBlockEnd
    while (nextNonEmpty < lines.length) {
      const t = lines[nextNonEmpty].text.trim()
      if (t === '' || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) {
        nextNonEmpty++
        continue
      }
      break
    }
    if (nextNonEmpty < lines.length) {
      const nextTrimmed = lines[nextNonEmpty].text.trim()
      if (/^}\s*else\b|^else\b/.test(nextTrimmed)) continue
    }

    for (let j = ifBodyStart; j < ifBlockEnd; j++) {
      const bodyTrimmed = lines[j].text.trim()
      if (/^return\b|^throw\b/.test(bodyTrimmed)) {
        guardReturnLines.add(j)
      }
    }
  }

  // Also detect braceless guard returns
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].text.match(terminatorRe)
    if (!match) continue
    if (guardReturnLines.has(i)) continue

    const terminatorKind = match[1]
    if (terminatorKind !== 'return' && terminatorKind !== 'throw') continue

    if (isGuardReturn(lines, startDepths, i)) {
      guardReturnLines.add(i)
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].text.match(terminatorRe)
    if (!match) continue

    const terminatorKind = match[1]
    const terminatorStartDepth = startDepths[i]

    if (inCatchFinally.has(i)) continue
    if (inCallback.has(i)) continue
    if (callbackMethodRe.test(lines[i].text)) continue
    if (/=>\s*\{/.test(lines[i].text)) continue
    if (guardReturnLines.has(i)) continue

    let endLine = i
    if (
      !lines[i].text.trimEnd().endsWith(';') &&
      !lines[i].text.trimEnd().endsWith('}')
    ) {
      for (let j = i + 1; j < lines.length && j <= i + 5; j++) {
        endLine = j
        if (lines[j].text.includes(';') || lines[j].text.trimEnd().endsWith('}')) break
      }
    }

    for (let j = endLine + 1; j < lines.length; j++) {
      const text = lines[j].text.trim()

      if (
        text.startsWith('} catch') ||
        text.startsWith('} else') ||
        text.startsWith('} finally')
      )
        break

      if (isClosingBraceLine(text)) continue

      if (
        text === '' ||
        text.startsWith('//') ||
        text.startsWith('/*') ||
        text.startsWith('*')
      )
        continue

      if (startDepths[j] !== terminatorStartDepth) break

      const severity: 'warning' | 'error' = terminatorKind === 'return' ? 'warning' : 'error'

      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'dead-flow/unreachable-after-terminator',
          message: `Unreachable code after ${terminatorKind} on line ${lines[i].num}`,
          line: lines[j].num,
          severity,
          help: `Remove or move the unreachable code after the ${terminatorKind} statement on line ${lines[i].num}`,
          suggestion: {
            type: 'delete',
            text: '',
            confidence: 0.9,
            reason: `Code after ${terminatorKind} can never execute`,
            range: {
              startLine: lines[j].num,
              startCol: 1,
              endLine: lines[j].num,
              endCol: lines[j].text.length + 1,
            },
          },
          detail: { terminatorKind, terminatorLine: lines[i].num },
        }),
      )
      break
    }
  }

  return diagnostics
}

function isGuardReturn(
  lines: Array<{ num: number; text: string }>,
  startDepths: number[],
  idx: number,
): boolean {
  let prevIdx = idx - 1
  while (prevIdx >= 0) {
    const prevTrimmed = lines[prevIdx].text.trim()
    if (
      prevTrimmed === '' ||
      prevTrimmed.startsWith('//') ||
      prevTrimmed.startsWith('/*') ||
      prevTrimmed.startsWith('*')
    ) {
      prevIdx--
      continue
    }
    break
  }

  if (prevIdx < 0) return false

  const prevTrimmed = lines[prevIdx].text.trim()

  if (/^if\s*\(/.test(prevTrimmed) && !prevTrimmed.includes('{')) {
    let nextIdx = idx + 1
    while (nextIdx < lines.length) {
      const nextTrimmed = lines[nextIdx].text.trim()
      if (
        nextTrimmed === '' ||
        nextTrimmed.startsWith('//') ||
        nextTrimmed.startsWith('/*') ||
        nextTrimmed.startsWith('*')
      ) {
        nextIdx++
        continue
      }
      if (nextTrimmed.startsWith('else')) return false
      break
    }
    return true
  }

  return false
}
