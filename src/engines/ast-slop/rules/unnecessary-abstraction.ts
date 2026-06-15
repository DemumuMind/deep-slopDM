// ── Unnecessary Abstraction Rule ───────────────────────────
// Flags interfaces with a single implementor or abstract classes with one subclass.

import type { Diagnostic, Language } from '../../../types/index.js'
import { diag } from '../shared.js'

export function detectUnnecessaryAbstraction(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const results: Diagnostic[] = []
  if (language === 'python') return results

  const interfaceRe = /^\s*(?:export\s+)?interface\s+(\w+)/
  const abstractClassRe = /^\s*(?:export\s+)?abstract\s+class\s+(\w+)/
  const implementsRe = /\bimplements\s+(\w+)/
  const extendsRe = /\bextends\s+(\w+)/

  const interfaces = new Map<string, { line: number; col: number }>()
  const abstractClasses = new Map<string, { line: number; col: number }>()
  const implementors = new Map<string, number>()
  const subclasses = new Map<string, number>()

  for (const { num, text } of lines) {
    const trimmed = text.trim()

    const ifaceMatch = trimmed.match(interfaceRe)
    if (ifaceMatch) {
      interfaces.set(ifaceMatch[1], { line: num, col: text.indexOf(ifaceMatch[1]) + 1 })
    }

    const absMatch = trimmed.match(abstractClassRe)
    if (absMatch) {
      abstractClasses.set(absMatch[1], { line: num, col: text.indexOf(absMatch[1]) + 1 })
    }

    const implMatch = trimmed.match(implementsRe)
    if (implMatch) {
      implementors.set(implMatch[1], (implementors.get(implMatch[1]) ?? 0) + 1)
    }

    const extMatch = trimmed.match(extendsRe)
    if (extMatch) {
      if (abstractClasses.has(extMatch[1])) {
        subclasses.set(extMatch[1], (subclasses.get(extMatch[1]) ?? 0) + 1)
      }
    }
  }

  for (const [name, pos] of interfaces) {
    const count = implementors.get(name) ?? 0
    if (count === 1) {
      results.push(
        diag({
          filePath,
          rule: 'ast-slop/unnecessary-abstraction',
          severity: 'info',
          message: `Interface "${name}" has only 1 implementor — unnecessary abstraction`,
          help: 'Consider removing the interface and using the concrete type directly, or add more implementors to justify the abstraction layer.',
          line: pos.line,
          column: pos.col,
          fixable: false,
          detail: { interfaceName: name, implementorCount: count },
        }),
      )
    }
  }

  for (const [name, pos] of abstractClasses) {
    const count = subclasses.get(name) ?? 0
    if (count === 1) {
      results.push(
        diag({
          filePath,
          rule: 'ast-slop/unnecessary-abstraction',
          severity: 'info',
          message: `Abstract class "${name}" has only 1 subclass — unnecessary abstraction`,
          help: 'Consider removing the abstract class and using the concrete type directly, or add more subclasses to justify the abstraction layer.',
          line: pos.line,
          column: pos.col,
          fixable: false,
          detail: { abstractClassName: name, subclassCount: count },
        }),
      )
    }
  }

  return results
}
