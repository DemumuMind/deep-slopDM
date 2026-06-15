// ── Unreachable Code After If/Else Return Rule ──────────────────
// Detects code after if/else where both branches return/throw.

import { toLines } from "../../../utils/file-utils.js"
import { isClosingBraceLine, makeDiagnostic } from "../shared.js"

export function detectUnreachableAfterIfElseReturn(
  content: string,
  filePath: string,
): ReturnType<typeof makeDiagnostic>[] {
  const diagnostics: ReturnType<typeof makeDiagnostic>[] = []
  const lines = toLines(content)

  const startDepths: number[] = []
  let depth = 0
  for (let i = 0; i < lines.length; i++) {
    startDepths.push(depth)
    for (const ch of lines[i].text) {
      if (ch === "{") depth++
      if (ch === "}") depth--
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text.trim()
    if (!text.startsWith("if") && !text.startsWith("} else if")) continue

    const ifStartLine = i

    let braceDepth = 0
    let ifBlockEnd = -1
    let hasIfTerminator = false
    let j = i

    while (j < lines.length && !lines[j].text.includes("{")) j++
    if (j >= lines.length) continue
    braceDepth = 1
    j++

    while (j < lines.length && braceDepth > 0) {
      const t = lines[j].text.trim()
      for (const ch of lines[j].text) {
        if (ch === "{") braceDepth++
        if (ch === "}") braceDepth--
      }
      if (braceDepth === 0) {
        ifBlockEnd = j
        break
      }
      if (/^\s*(return\b|throw\b)/.test(lines[j].text)) {
        hasIfTerminator = true
      }
      j++
    }

    if (!hasIfTerminator || ifBlockEnd === -1) continue

    let elseStart = ifBlockEnd + 1
    while (elseStart < lines.length) {
      const t = lines[elseStart].text.trim()
      if (t === "" || t.startsWith("//")) { elseStart++; continue }
      break
    }

    if (elseStart >= lines.length) continue
    if (!lines[elseStart].text.trim().startsWith("else")) continue

    braceDepth = 0
    let elseBlockEnd = -1
    let hasElseTerminator = false
    let k = elseStart

    while (k < lines.length && !lines[k].text.includes("{")) k++
    if (k >= lines.length) continue
    braceDepth = 1
    k++

    while (k < lines.length && braceDepth > 0) {
      for (const ch of lines[k].text) {
        if (ch === "{") braceDepth++
        if (ch === "}") braceDepth--
      }
      if (braceDepth === 0) {
        elseBlockEnd = k
        break
      }
      if (/^\s*(return\b|throw\b)/.test(lines[k].text)) {
        hasElseTerminator = true
      }
      k++
    }

    if (!hasElseTerminator || elseBlockEnd === -1) continue

    const constructDepth = startDepths[ifStartLine]
    for (let m = elseBlockEnd + 1; m < lines.length; m++) {
      const t = lines[m].text.trim()
      if (isClosingBraceLine(t)) break
      if (t === "" || t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) continue

      if (startDepths[m] < constructDepth) break
      if (startDepths[m] > constructDepth) continue

      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: "dead-flow/unreachable-after-if-else-return",
          message: `Unreachable code: both if/else branches terminate (lines ${ifStartLine + 1}-${elseBlockEnd + 1})`,
          line: lines[m].num,
          severity: "warning",
          help: "Remove the unreachable code after the if/else that both return/throw",
          suggestion: {
            type: "delete",
            text: "",
            confidence: 0.85,
            reason: "Code after if/else where both branches terminate is unreachable",
            range: {
              startLine: lines[m].num,
              startCol: 1,
              endLine: lines[m].num,
              endCol: lines[m].text.length + 1,
            },
          },
        }),
      )
      break
    }
  }

  return diagnostics
}
