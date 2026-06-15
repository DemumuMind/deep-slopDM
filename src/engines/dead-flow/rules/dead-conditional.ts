// ── Dead Conditional Rule ───────────────────────────────────────────────
// Detects if/else conditions that are statically always truthy or always falsy.

import { toLines } from "../../../utils/file-utils.js"
import { makeDiagnostic } from "../shared.js"

export function detectDeadConditional(
  content: string,
  filePath: string,
): ReturnType<typeof makeDiagnostic>[] {
  const diagnostics: ReturnType<typeof makeDiagnostic>[] = []
  const lines = toLines(content)

  const alwaysTruthy = /^(true|!false|[1-9]\d*|![0]+)$/
  const alwaysFalsy = /^(false|!true|0+|null|undefined|!1)$/

  for (const { num, text } of lines) {
    const trimmed = text.trim()

    const ifMatch = trimmed.match(/^if\s*\(\s*(.+?)\s*\)\s*\{?$/)
    if (!ifMatch) continue

    const condition = ifMatch[1].trim()

    if (condition.includes("&&") || condition.includes("||") || condition.includes("==") || condition.includes("!=") || condition.includes(">") || condition.includes("<")) continue

    let deadBranch: "then" | "else" | null = null

    if (alwaysTruthy.test(condition)) {
      deadBranch = "else"
    } else if (alwaysFalsy.test(condition)) {
      deadBranch = "then"
    }

    if (deadBranch) {
      const branchDesc = deadBranch === "then" ? "if-block" : "else-block"
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: "dead-flow/dead-conditional",
          message: `Condition \`${condition}\` is always ${deadBranch === "then" ? "falsy" : "truthy"}, making the ${branchDesc} unreachable`,
          line: num,
          severity: "warning",
          help: `Simplify the conditional — the ${branchDesc} can never execute`,
          suggestion: {
            type: "refactor",
            text: deadBranch === "else" ? "// remove else branch, keep if-body" : "// remove if block, keep else body as direct code",
            confidence: 0.8,
            reason: `Condition is statically determined to always be ${deadBranch === "then" ? "falsy" : "truthy"}`,
          },
          detail: { condition, deadBranch },
        }),
      )
    }
  }

  return diagnostics
}
