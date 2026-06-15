// ── Dead Switch Case After Default Rule ───────────────────────
// Detects switch cases placed after the default case, which are unreachable.

import { toLines } from "../../../utils/file-utils.js"
import { makeDiagnostic } from "../shared.js"

export function detectDeadSwitchCaseAfterDefault(
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

    const cases: Array<{ keyword: string; line: number }> = []

    while (j < lines.length && braceDepth > 0) {
      const lineText = lines[j].text
      for (const ch of lineText) {
        if (ch === "{") braceDepth++
        if (ch === "}") braceDepth--
      }

      const t = lineText.trim()
      if (t.startsWith("case ") || t.startsWith("default:")) {
        cases.push({
          keyword: t.startsWith("default") ? "default" : "case",
          line: lines[j].num,
        })
      }
      j++
    }

    const defaultIdx = cases.findIndex((c) => c.keyword === "default")
    if (defaultIdx !== -1 && defaultIdx < cases.length - 1) {
      for (let k = defaultIdx + 1; k < cases.length; k++) {
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: "dead-flow/dead-switch-case-after-default",
            message: `Case on line ${cases[k].line} is unreachable: it appears after the default case`,
            line: cases[k].line,
            severity: "warning",
            help: "Move the default case to the end of the switch, or remove the unreachable case",
            suggestion: {
              type: "refactor",
              text: "// move default to end of switch",
              confidence: 0.85,
              reason: "Cases after default can never be reached",
            },
          }),
        )
      }
    }
  }

  return diagnostics
}
