import {
  CodeActionKind,
  type CodeAction,
  type WorkspaceEdit,
  type TextEdit,
} from 'vscode-languageserver/node'
import type { Diagnostic } from '../types/index.js'
import { toLspRange } from './diagnostics.js'

// ── Quick Fixes ────────────────────────────────────────

/** Build quick-fix code actions for a fixable deep-slop diagnostic. */
export function toCodeActions(
  diagnostic: Diagnostic,
  uri: string,
): CodeAction[] {
  if (!diagnostic.fixable || !diagnostic.suggestion) {
    return []
  }

  const range = toLspRange(
    diagnostic.line,
    diagnostic.column,
    diagnostic.suggestion,
  )

  const textEdit: TextEdit = {
    range,
    newText: diagnostic.suggestion.text,
  }

  const edit: WorkspaceEdit = {
    changes: { [uri]: [textEdit] },
  }

  return [
    {
      title: `Fix ${diagnostic.rule}`,
      kind: CodeActionKind.QuickFix,
      edit,
      isPreferred: true,
    },
  ]
}
