// ── Unused Variable Rule ──────────────────────────────────────────────────
// Detects declared variables, functions, and types that are never referenced.

import { toLines } from "../../../utils/file-utils.js"
import { escapeRegExp, makeDiagnostic } from "../shared.js"

export function detectUnusedVariable(
  content: string,
  filePath: string,
): ReturnType<typeof makeDiagnostic>[] {
  const diagnostics: ReturnType<typeof makeDiagnostic>[] = []
  const lines = toLines(content)

  const declarations = new Map<
    string,
    { line: number; isExported: boolean; isReactComponent: boolean; isType: boolean; isParameter: boolean }
  >()

  for (const { num, text } of lines) {
    const trimmed = text.trim()

    const varMatch = trimmed.match(
      /^(?:export\s+)?(?:const|let|var)\s+(\w+)/,
    )
    if (varMatch) {
      const name = varMatch[1]
      declarations.set(name, {
        line: num,
        isExported: trimmed.startsWith("export"),
        isReactComponent: /^[A-Z]/.test(name) && (trimmed.includes("=>") || trimmed.includes("function")),
        isType: false,
        isParameter: false,
      })
      continue
    }

    const fnMatch = trimmed.match(
      /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
    )
    if (fnMatch) {
      const name = fnMatch[1]
      declarations.set(name, {
        line: num,
        isExported: trimmed.startsWith("export"),
        isReactComponent: /^[A-Z]/.test(name),
        isType: false,
        isParameter: false,
      })
      continue
    }

    const typeMatch = trimmed.match(
      /^(?:export\s+)?(?:type|interface)\s+(\w+)/,
    )
    if (typeMatch) {
      declarations.set(typeMatch[1], {
        line: num,
        isExported: trimmed.startsWith("export"),
        isReactComponent: false,
        isType: true,
        isParameter: false,
      })
      continue
    }

    const arrowParamMatch = trimmed.match(
      /^(?:export\s+)?(?:const|let)\s+\w+\s*=\s*\(\s*([^)]+)\)\s*=>/,
    )
    if (arrowParamMatch) {
      const params = arrowParamMatch[1].split(",").map((p) => {
        const parts = p.trim().split(":")[0].trim()
        return parts.replace(/^\.\.\./, "").trim()
      })
      for (const param of params) {
        if (param && /^\w+$/.test(param)) {
          declarations.set(param, {
            line: num,
            isExported: false,
            isReactComponent: false,
            isType: false,
            isParameter: true,
          })
        }
      }
    }
  }

  const allContent = content
  for (const [name, info] of declarations) {
    if (name.startsWith("_")) continue
    if (info.isExported) continue
    if (info.isReactComponent) continue
    if (info.isType) continue
    if (info.isParameter) continue

    const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, "g")
    const occurrences = (allContent.match(re) ?? []).length

    if (occurrences <= 1) {
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: "dead-flow/unused-variable",
          message: `Variable \`${name}\` is declared but never used`,
          line: info.line,
          severity: "suggestion",
          fixable: true,
          help: `Remove the unused variable \`${name}\` or prefix with _ if intentionally unused`,
          suggestion: {
            type: "delete",
            text: "",
            confidence: 0.7,
            reason: `Variable \`${name}\` is never referenced after its declaration`,
          },
          detail: { variableName: name, referenceCount: occurrences },
        }),
      )
    }
  }

  return diagnostics
}
