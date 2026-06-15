// ── Empty Block Rule ─────────────────────────────────────
// Detects empty if/for/while/try/catch/finally/switch/else blocks.

import { toLines } from "../../../utils/file-utils.js"
import { isClosingBraceLine, makeDiagnostic } from "../shared.js"

export function detectEmptyBlock(
  content: string,
  filePath: string,
): ReturnType<typeof makeDiagnostic>[] {
  const diagnostics: ReturnType<typeof makeDiagnostic>[] = []
  const lines = toLines(content)

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].text.trim()

    const sameLineEmpty = trimmed.match(
      /^(?:if|else|for|while|do|try|catch|finally|switch)\s*\([^)]*\)\s*\{(.*)\}\s*$/,
    )
    if (sameLineEmpty) {
      const innerContent = sameLineEmpty[1].trim()
      const construct = trimmed.split("{")[0].trim()
      const isCatchOrFinally = /catch\b/.test(construct) || /finally\b/.test(construct)

      if (isCatchOrFinally) {
        const catchMatch = construct.match(/catch\s*\(\s*(\w+)\s*\)/)
        const errorVar = catchMatch ? catchMatch[1] : "error"
        if (/catch\b/.test(construct) && innerContent === "") {
          diagnostics.push(
            makeDiagnostic({
              filePath,
              rule: "dead-flow/empty-block",
              message: "Empty catch block — error is silently swallowed",
              line: lines[i].num,
              severity: "warning",
              fixable: true,
              help: "Empty catch blocks silently swallow errors. Add console.error() or a TODO comment to handle the error.",
              suggestion: {
                type: "replace",
                text: `${construct} { console.error(${errorVar}) }`,
                range: { startLine: lines[i].num, startCol: 1, endLine: lines[i].num, endCol: lines[i].text.length + 1 },
                confidence: 0.75,
                reason: "Empty catch blocks hide errors. Adding console.error() ensures errors are at least logged.",
              },
            }),
          )
        }
        continue
      }

      if (innerContent !== "") continue

      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: "dead-flow/empty-block",
          message: `Empty block after \`${construct}\``,
          line: lines[i].num,
          severity: "info",
          fixable: true,
          help: "Empty blocks may indicate swallowed logic or placeholder code. Add implementation or a comment explaining intent.",
          suggestion: {
            type: "replace",
            text: `${construct} { /* intentional */ }`,
            range: { startLine: lines[i].num, startCol: 1, endLine: lines[i].num, endCol: lines[i].text.length + 1 },
            confidence: 0.8,
            reason: "Empty block likely indicates missing implementation; adding an intentional comment makes the intent explicit.",
          },
        }),
      )
      continue
    }

    const elseEmpty = trimmed.match(/^else\s*\{(.*)\}\s*$/)
    if (elseEmpty) {
      const innerContent = elseEmpty[1].trim()
      if (innerContent === "") {
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: "dead-flow/empty-block",
            message: "Empty else block",
            line: lines[i].num,
            severity: "info",
            fixable: true,
            help: "Empty else block may indicate swallowed logic. Add implementation or remove the else clause.",
            suggestion: {
              type: "replace",
              text: "else { /* intentional */ }",
              range: { startLine: lines[i].num, startCol: 1, endLine: lines[i].num, endCol: lines[i].text.length + 1 },
              confidence: 0.8,
              reason: "Empty else block likely indicates missing implementation; adding an intentional comment makes the intent explicit.",
            },
          }),
        )
      }
      continue
    }

    if (trimmed.endsWith("{") && !trimmed.includes("}")) {
      const isControlFlow =
        /^(?:if|else|for|while|do|try|catch|finally|switch)/.test(trimmed) ||
        trimmed === "{"
      if (!isControlFlow) continue

      let nextLine = i + 1
      let isEmpty = true
      let hasComment = false
      while (nextLine < lines.length) {
        const nextTrimmed = lines[nextLine].text.trim()
        if (nextTrimmed.startsWith("}") || nextTrimmed.startsWith("});")) {
          break
        }
        if (nextTrimmed !== "") {
          if (nextTrimmed.startsWith("//") || nextTrimmed.startsWith("/*") || nextTrimmed.startsWith("*")) {
            hasComment = true
          } else {
            isEmpty = false
            break
          }
        }
        nextLine++
      }

      if (isEmpty) {
        const construct = trimmed.split("{")[0].trim() || "block"

        const isCatchOrFinallyBlock =
          construct.startsWith("catch") ||
          construct.startsWith("finally") ||
          (trimmed === "{" &&
            i > 0 &&
            (/^\s*}\s*catch\b/.test(lines[i - 1].text) || /^\s*}\s*finally\b/.test(lines[i - 1].text)))

        if (isCatchOrFinallyBlock && hasComment) continue

        if (isCatchOrFinallyBlock && construct.startsWith("catch") && !hasComment) {
          const catchMatch = construct.match(/catch\s*\(\s*(\w+)\s*\)/)
          const errorVar = catchMatch ? catchMatch[1] : "error"
          diagnostics.push(
            makeDiagnostic({
              filePath,
              rule: "dead-flow/empty-block",
              message: "Empty catch block — error is silently swallowed",
              line: lines[i].num,
              severity: "warning",
              fixable: true,
              help: "Empty catch blocks silently swallow errors. Add console.error() or a TODO comment to handle the error.",
              suggestion: {
                type: "replace",
                text: `${construct} {\n  console.error(${errorVar})\n}`,
                range: { startLine: lines[i].num, startCol: 1, endLine: nextLine + 1, endCol: 1 },
                confidence: 0.7,
                reason: "Empty catch blocks hide errors. Adding console.error() ensures errors are at least logged.",
              },
            }),
          )
          continue
        }

        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: "dead-flow/empty-block",
            message: `Empty ${construct} block`,
            line: lines[i].num,
            severity: "info",
            fixable: true,
            help: "Empty blocks may indicate swallowed logic or placeholder code. Add implementation or a comment.",
            suggestion: {
              type: "replace",
              text: `${construct} {\n  // intentional\n}`,
              range: { startLine: lines[i].num, startCol: 1, endLine: nextLine + 1, endCol: 1 },
              confidence: 0.8,
              reason: "Empty block likely indicates missing implementation; adding an intentional comment makes the intent explicit.",
            },
          }),
        )
      }
    }
  }

  return diagnostics
}
