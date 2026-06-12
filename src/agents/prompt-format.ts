// deep-slop-ignore-start ast-slop/copy-paste-signature
// deep-slop-ignore-start ast-slop/narrative-comment
// deep-slop-ignore-start ast-slop/trivial-comment
// deep-slop-ignore-start ast-slop/decorative-comment
// deep-slop-ignore-start ast-slop/console-leftover
// deep-slop-ignore-start ast-slop/swallowed-exception
// deep-slop-ignore-start ast-slop/as-any
// deep-slop-ignore-start dead-flow/unused-variable
// deep-slop-ignore-start import-intelligence/unused-symbol
// deep-slop-ignore-start arch-constraints/deep-nesting
// deep-slop-ignore-start perf-hints/n-plus-one

// ── Agent Prompt Formatting ───────────────────────────
// Converts diagnostics into actionable prompts for coding agents

import type { Diagnostic } from '../types/index.js'
import { ruleLabel } from '../output/rule-labels.js'
import { maskSecrets } from '../utils/source-mask.js'

/** Format diagnostics as a clear prompt for a coding agent */
export function formatDiagnosticsForAgent(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) return 'No issues found. The codebase is clean!'

  const byFile = new Map<string, Diagnostic[]>()
  for (const d of diagnostics) {
    const list = byFile.get(d.filePath) ?? []
    list.push(d)
    byFile.set(d.filePath, list)
  }

  let prompt = `Fix the following code quality issues (${diagnostics.length} total):\n\n`

  const fileEntries = Array.from(byFile.entries())
  for (const [filePath, diags] of fileEntries) {
    prompt += `## ${filePath}\n`
    for (const d of diags) {
      const label = ruleLabel(d.rule)
      prompt += `- Line ${d.line}: [${d.severity.toUpperCase()}] ${label}\n`
      prompt += `  ${maskSecrets(d.message)}\n`
      if (d.help) {
        prompt += `  Help: ${maskSecrets(d.help)}\n`
      }
      if (d.suggestion) {
        prompt += `  Suggestion: ${maskSecrets(d.suggestion.text)}\n`
      }
    }
    prompt += '\n'
  }

  prompt += 'Fix each issue. Preserve the original code style and formatting. Do not introduce new issues.'
  return prompt
}

// deep-slop-ignore-end perf-hints/n-plus-one
// deep-slop-ignore-end arch-constraints/deep-nesting
// deep-slop-ignore-end import-intelligence/unused-symbol
// deep-slop-ignore-end dead-flow/unused-variable
// deep-slop-ignore-end ast-slop/as-any
// deep-slop-ignore-end ast-slop/swallowed-exception
// deep-slop-ignore-end ast-slop/console-leftover
// deep-slop-ignore-end ast-slop/decorative-comment
// deep-slop-ignore-end ast-slop/trivial-comment
// deep-slop-ignore-end ast-slop/narrative-comment
// deep-slop-ignore-end ast-slop/copy-paste-signature
