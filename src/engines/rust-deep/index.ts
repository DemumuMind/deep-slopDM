// ── Rust Deep Engine ─────────────────────────────────────

import type {
  Diagnostic,
  Engine,
  EngineContext,
  EngineResult,
} from '../../types/index.js'
import { readFileContent, toLines } from '../../utils/file-utils.js'
import {
  collectRustFiles,
  isRustFile,
  relativePath,
} from './helpers.js'
import {
  detectCloneOnCopy,
  detectExpectInProd,
  detectLargeEnumVariant,
  detectRedundantClone,
  detectTodoMacro,
  detectUnimplementedMacro,
  detectUnsafeUsage,
  detectUnwrapInProd,
  detectWildcardCatch,
} from './rules.js'

// ── Engine entry point ───────────────────────────────────

export const rustDeepEngine: Engine = {
  name: 'rust-deep' as const,
  description: 'Rust-specific AI slop and quality analysis (unwrap, todo!, clone-on-copy, unsafe, match wildcards, large enum variants)',
  supportedLanguages: ['rust'],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now()

    const files =
      context.files?.length && context.files.some((f) => isRustFile(f))
        ? context.files.filter((f) => isRustFile(f))
        : await collectRustFiles(context.rootDirectory, context.config.exclude)

    const diagnostics: Diagnostic[] = []

    for (const filePath of files) {
      const content = await readFileContent(filePath)
      const lines = toLines(content)
      const relPath = relativePath(context.rootDirectory, filePath)

      diagnostics.push(
        ...detectUnwrapInProd(relPath, lines),
        ...detectTodoMacro(relPath, lines),
        ...detectUnimplementedMacro(relPath, lines),
        ...detectCloneOnCopy(relPath, lines),
        ...detectLargeEnumVariant(relPath, lines),
        ...detectWildcardCatch(relPath, lines),
        ...detectUnsafeUsage(relPath, lines),
        ...detectExpectInProd(relPath, lines),
        ...detectRedundantClone(relPath, lines),
      )
    }

    return {
      engine: 'rust-deep',
      diagnostics,
      elapsed: performance.now() - start,
      skipped: false,
    }
  },
}
