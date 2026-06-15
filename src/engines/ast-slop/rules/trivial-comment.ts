// ── Trivial Comment Rule ───────────────────────────
// Detects comments that merely restate the next line of code.

import type { Diagnostic, Language } from '../../../types/index.js'
import { diag } from '../shared.js'

export function detectTrivialComment(
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const results: Diagnostic[] = []
  const commentPrefix = language === 'python' ? '#' : '//'

  for (let i = 0; i < lines.length - 1; i++) {
    const current = lines[i].text.trim()
    const next = lines[i + 1].text.trim()

    if (!current.startsWith(commentPrefix)) continue
    if (!next || next.startsWith(commentPrefix)) continue

    const escapedPrefix = commentPrefix.replace('/', '\\/')
    const commentText = current.replace(new RegExp(`^\\s*${escapedPrefix}\\s*`), '').trim().toLowerCase()
    if (!commentText) continue

    const normalizedComment = commentText
      .replace(/^(initialize|set up|handle|process|create|update|calculate|check if|define|get|set|return|add|remove|delete|fetch|load|save|validate|parse|reset|clear|log|assign|declare|call|invoke)\s+/i, '')
      .replace(/^(the |a |an |this |that |these |those )/i, '')
      .trim()

    if (!normalizedComment || normalizedComment.length < 3) continue

    const codeLower = next.toLowerCase()
    const commentWords = normalizedComment.split(/\s+/).filter((w) => w.length > 2)
    if (commentWords.length === 0) continue

    const matchCount = commentWords.filter((w) => codeLower.includes(w)).length
    const matchRatio = matchCount / commentWords.length

    if (matchRatio >= 0.6 && matchCount >= 2) {
      const col = lines[i].text.indexOf(current.charAt(0)) + 1
      results.push(
        diag({
          filePath,
          rule: 'ast-slop/trivial-comment',
          severity: 'suggestion',
          message: `Comment restates the obvious: next line already expresses "${normalizedComment}"`,
          help: "Remove comments that simply restate what the code does. If the code isn't clear enough, improve the code instead.",
          line: lines[i].num,
          column: col,
          fixable: true,
          suggestion: {
            type: 'delete',
            text: '',
            range: { startLine: lines[i].num, startCol: 1, endLine: lines[i].num, endCol: lines[i].text.length + 1 },
            confidence: 0.65,
            reason: 'The comment merely restates what the next line of code already makes obvious.',
          },
        }),
      )
    }
  }
  return results
}
