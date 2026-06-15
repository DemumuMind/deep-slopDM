import { isAbsolute, join, relative } from 'node:path'
import type { Engine, EngineContext, EngineResult, Diagnostic } from '../../types/index.js'
import { readFileContent } from '../../utils/file-utils.js'
import { ENGINE_NAME, collectFiles } from './helpers.js'
import {
  checkUncheckedError,
  checkEmptyInterface,
  checkExportedNoDoc,
  checkDeepCopyMissing,
  checkInitSideEffect,
  checkDeferInLoop,
  checkContextMissing,
  checkGotoUsage,
  checkPackageCycle,
} from './rules.js'

// ── Engine export ──────────────────────────────────────────

export const goDeepEngine: Engine = {
  name: ENGINE_NAME,
  description:
    'Deep Go-specific analysis: unchecked errors, empty interfaces, missing docs, value copies, init side effects, defer-in-loop, missing context, goto usage, and package cycles.',
  supportedLanguages: ['go'],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now()
    const diagnostics: Diagnostic[] = []
    const files = await collectFiles(context)
    const contents: string[] = []

    for (const relOrAbs of files) {
      const absPath = isAbsolute(relOrAbs) ? relOrAbs : join(context.rootDirectory, relOrAbs)
      const relPath = isAbsolute(relOrAbs) ? relative(context.rootDirectory, absPath) : relOrAbs
      let content: string
      try {
        content = await readFileContent(absPath)
      } catch {
        continue
      }
      contents.push(content)
      diagnostics.push(...checkUncheckedError(content, relPath))
      diagnostics.push(...checkEmptyInterface(content, relPath))
      diagnostics.push(...checkExportedNoDoc(content, relPath))
      diagnostics.push(...checkDeepCopyMissing(content, relPath))
      diagnostics.push(...checkInitSideEffect(content, relPath))
      diagnostics.push(...checkDeferInLoop(content, relPath))
      diagnostics.push(...checkContextMissing(content, relPath))
      diagnostics.push(...checkGotoUsage(content, relPath))
    }

    if (files.length > 0) {
      diagnostics.push(...checkPackageCycle(files, contents))
    }

    return {
      engine: ENGINE_NAME,
      diagnostics,
      elapsed: performance.now() - start,
      skipped: false,
    }
  },
}
