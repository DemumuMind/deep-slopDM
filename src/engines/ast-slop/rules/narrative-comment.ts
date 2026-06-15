// ── Narrative Comment Rule ──────────────────────────
// Detects comments that describe WHAT the code does instead of WHY.

import type { Diagnostic, Language } from '../../../types/index.js'
import { diag } from '../shared.js'

const NARRATIVE_PATTERNS: { regex: RegExp; label: string }[] = [
  { regex: /\/\/\s*Initialize/i, label: 'Initialize' },
  { regex: /\/\/\s*Set up/i, label: 'Set up' },
  { regex: /\/\/\s*Handle/i, label: 'Handle' },
  { regex: /\/\/\s*Process/i, label: 'Process' },
  { regex: /\/\/\s*Create/i, label: 'Create' },
  { regex: /\/\/\s*Update/i, label: 'Update' },
  { regex: /\/\/\s*Calculate/i, label: 'Calculate' },
  { regex: /\/\/\s*Check if/i, label: 'Check if' },
  { regex: /\/\/\s*Define/i, label: 'Define' },
  { regex: /\/\*\s*We need to/i, label: 'We need to' },
  { regex: /\/\*\s*This function/i, label: 'This function' },
]

const NARRATIVE_PATTERNS_PY: { regex: RegExp; label: string }[] = [
  { regex: /#\s*Initialize/i, label: 'Initialize' },
  { regex: /#\s*Set up/i, label: 'Set up' },
  { regex: /#\s*Handle/i, label: 'Handle' },
  { regex: /#\s*Process/i, label: 'Process' },
  { regex: /#\s*Create/i, label: 'Create' },
  { regex: /#\s*Update/i, label: 'Update' },
  { regex: /#\s*Calculate/i, label: 'Calculate' },
  { regex: /#\s*Check if/i, label: 'Check if' },
  { regex: /#\s*Define/i, label: 'Define' },
  { regex: /"""\s*We need to/i, label: 'We need to' },
  { regex: /"""\s*This function/i, label: 'This function' },
]

export function detectNarrativeComment(
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const patterns = language === 'python' ? NARRATIVE_PATTERNS_PY : NARRATIVE_PATTERNS
  const results: Diagnostic[] = []

  for (const { num, text } of lines) {
    const trimmed = text.trim()
    for (const { regex, label } of patterns) {
      if (regex.test(trimmed)) {
        const col = text.indexOf(trimmed.charAt(0)) + 1
        results.push(
          diag({
            filePath,
            rule: 'ast-slop/narrative-comment',
            severity: 'suggestion',
            message: `Narrative comment: "${label}" — describes WHAT, not WHY`,
            help: 'Remove or replace with a comment explaining the reasoning (WHY), not the mechanics (WHAT). Code should be self-documenting for the WHAT.',
            line: num,
            column: col,
            fixable: true,
            suggestion: {
              type: 'delete',
              text: '',
              range: { startLine: num, startCol: 1, endLine: num, endCol: text.length + 1 },
              confidence: 0.7,
              reason: 'Narrative comments that only describe what the code does add noise. Delete or replace with a WHY comment.',
            },
          }),
        )
        break
      }
    }
  }
  return results
}
