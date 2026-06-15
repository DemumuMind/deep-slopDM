import { performance } from 'node:perf_hooks'
import { join, extname, relative } from 'node:path'
import type {
  Diagnostic,
  Engine,
  EngineContext,
  EngineResult,
  Severity,
  Category,
} from '../../types/index.js'
import { readFileContent, toLines } from '../../utils/file-utils.js'
import {
  SCAN_EXTENSIONS,
  detectNextJs,
  detectTailwind,
  isAppRouterProject,
  collectScanFiles,
} from './helpers.js'
import {
  checkMisplacedUseClient,
  checkMissingUseClient,
  checkPagesRouterInApp,
  checkNextRouterVsNavigation,
  checkImageMissingDimensions,
  checkMetadataInClient,
  checkHardcodedEnv,
  checkLinkWithoutAria,
  checkApplyAntiPattern,
  checkInlineStyleConflict,
  checkImportantModifier,
  checkDuplicateUtilities,
  checkMagicValues,
  checkIncompleteFlex,
  checkOverloadedClassname,
} from './rules.js'

// ── Engine ────────────────────────────────────────────────

export const frameworkLintEngine: Engine = {
  name: 'framework-lint' as const,
  description:
    'Framework-specific AI slop detection (Next.js, Tailwind CSS)',
  supportedLanguages: ['typescript', 'javascript', 'tsx', 'jsx'],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now()
    const diagnostics: Diagnostic[] = []
    const root = context.rootDirectory

    const isRelevant =
      context.languages.includes('typescript') ||
      context.languages.includes('javascript') ||
      context.languages.includes('tsx') ||
      context.languages.includes('jsx')

    if (!isRelevant) {
      return {
        engine: this.name,
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: 'No TypeScript or JavaScript detected in project',
      }
    }

    const hasNextJs = await detectNextJs(root)
    const hasTailwind = await detectTailwind(root)
    const isAppRouter = hasNextJs && await isAppRouterProject(root)

    if (!hasNextJs && !hasTailwind) {
      return {
        engine: this.name,
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: 'No Next.js or Tailwind CSS detected in project',
      }
    }

    const scanFiles = context.files?.length
      ? context.files.map((f) => join(root, f))
      : await collectScanFiles(root)

    for (const filePath of scanFiles) {
      const ext = extname(filePath)
      if (!SCAN_EXTENSIONS.has(ext)) continue

      let content
      try {
        content = await readFileContent(filePath)
      } catch {
        continue
      }

      const relPath = relative(root, filePath)
      const lines = toLines(content)

      if (hasNextJs && ext !== '.css') {
        const nextDiagnostics = [
          ...checkMisplacedUseClient(filePath, relPath, content, lines),
          ...checkMissingUseClient(filePath, relPath, content, lines),
          ...checkPagesRouterInApp(filePath, relPath, content, lines, isAppRouter),
          ...checkNextRouterVsNavigation(filePath, relPath, content, lines, isAppRouter),
          ...checkImageMissingDimensions(filePath, relPath, content, lines),
          ...checkMetadataInClient(filePath, relPath, content, lines),
          ...checkHardcodedEnv(filePath, relPath, content, lines),
          ...checkLinkWithoutAria(filePath, relPath, content, lines),
        ]
        diagnostics.push(...nextDiagnostics)
      }

      if (hasTailwind) {
        const tailwindDiagnostics = [
          ...checkApplyAntiPattern(filePath, relPath, content, lines),
          ...checkInlineStyleConflict(filePath, relPath, content, lines),
          ...checkImportantModifier(filePath, relPath, content, lines),
          ...checkDuplicateUtilities(filePath, relPath, content, lines),
          ...checkMagicValues(filePath, relPath, content, lines),
          ...checkIncompleteFlex(filePath, relPath, content, lines),
          ...checkOverloadedClassname(filePath, relPath, content, lines),
        ]
        diagnostics.push(...tailwindDiagnostics)
      }
    }

    return {
      engine: this.name,
      diagnostics,
      elapsed: performance.now() - start,
      skipped: false,
    }
  },
}
