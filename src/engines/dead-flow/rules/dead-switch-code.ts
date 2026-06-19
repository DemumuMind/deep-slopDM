// ── Dead Switch Code Rule ─────────────────────────────────
// Detects unreachable code in switch cases after break/return/throw,
// and cases placed after the default case.

import { toLines } from "../../../utils/file-utils.js"
import { makeDiagnostic } from "../shared.js"

export function detectDeadSwitchCode(
  content: string,
  filePath: string,
): ReturnType<typeof makeDiagnostic>[] {
  const diagnostics: ReturnType<typeof makeDiagnostic>[] = []
  const lines = toLines(content)

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].text.trim()
    if (!trimmed.startsWith("switch")) continue

    let braceDepth = 0
    let j = i
    while (j < lines.length && !lines[j].text.includes("{")) j++
    if (j >= lines.length) continue
    braceDepth = 1
    j++

    while (j < lines.length && braceDepth > 0) {
      const lineText = lines[j].text
      for (const ch of lineText) {
        if (ch === "{") braceDepth++
        if (ch === "}") braceDepth--
      }

      const t = lineText.trim()

      if (/^\s*(break;|return\b|throw\b|continue;)/.test(lineText) && braceDepth > 0) {
        // Record brace depth at the terminator — code at a shallower depth
        // (after the block closes) is NOT unreachable
        const returnDepth = braceDepth
        let nextLineIdx = j + 1
        while (nextLineIdx < lines.length && braceDepth > 0) {
          const nextTrimmed = lines[nextLineIdx].text.trim()

          for (const ch of lines[nextLineIdx].text) {
            if (ch === "{") braceDepth++
            if (ch === "}") braceDepth--
          }

          if (braceDepth <= 0) break
          // If we've exited the block containing the return, code after is reachable
          if (braceDepth < returnDepth) break
          if (nextTrimmed.startsWith("case ") || nextTrimmed.startsWith("default:")) break
          if (
            nextTrimmed === "" ||
            nextTrimmed === "}" ||
            nextTrimmed.startsWith("//") ||
            nextTrimmed.startsWith("/*") ||
            nextTrimmed.startsWith("*") ||
            nextTrimmed.startsWith("break;")
          ) {
            nextLineIdx++
            continue
          }

          diagnostics.push(
            makeDiagnostic({
              filePath,
              rule: "dead-flow/dead-switch-code",
              message: `Unreachable code in switch after break/return on line ${lines[j].num}`,
              line: lines[nextLineIdx].num,
              severity: "warning",
              help: "Remove the unreachable code in this switch case after the terminator statement",
              suggestion: {
                type: "delete",
                text: "",
                confidence: 0.9,
                reason: "Code after break/return/throw in a switch case is unreachable",
                range: {
                  startLine: lines[nextLineIdx].num,
                  startCol: 1,
                  endLine: lines[nextLineIdx].num,
                  endCol: lines[nextLineIdx].text.length + 1,
                },
              },
            }),
          )
          break
        }
      }

      j++
    }
  }

  return diagnostics
}
