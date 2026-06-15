// ── Dup-Detect Engine (Calibrated) ──────────────────────
// Structural duplicate detection: identical blocks, similar blocks,
// duplicate imports across files, repeated constants, copy-paste functions.

import { extname } from 'node:path'
import type { Diagnostic, Engine, EngineContext, EngineResult } from '../../types/index.js'
import { readFileContent, toLines, extractImports } from '../../utils/file-utils.js'
import { collectFiles } from '../../utils/discover.js'
import {
  BLOCK_OVERLAP_STEP,
  extractBlocks,
  FILE_BATCH_SIZE,
  IDENTICAL_BLOCK_MIN_LINES,
  languageFromPath,
  LARGE_FILE_LINE_LIMIT,
  SUPPORTED_EXTS,
  type CodeBlock,
  type FunctionDef,
  type ImportOccurrence,
  type StringOccurrence,
} from './shared.js'
import { detectIdenticalBlocks } from './rules/identical-block.js'
import { detectSimilarBlocks } from './rules/similar-block.js'
import { detectDuplicateImports, extractNamedSymbols } from './rules/duplicate-import-across-files.js'
import { detectRepeatedConstants, extractStringLiterals } from './rules/repeated-constant.js'
import { detectCopyPasteFunctions, extractFunctions } from './rules/copy-paste-function.js'

export const dupDetectEngine: Engine = {
  name: 'dup-detect' as const,
  description:
    'Structural duplicate detection: identical blocks, similar blocks, duplicate imports, repeated constants, copy-paste functions',
  supportedLanguages: ['typescript', 'javascript', 'python'],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now()
    const diagnostics: Diagnostic[] = []

    const hasSupported = context.languages.some((l) => this.supportedLanguages.includes(l))
    if (!hasSupported) {
      return {
        engine: this.name,
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: 'No supported languages detected (need typescript, javascript, or python)',
      }
    }

    const enableSimilarBlocks = process.env.DEEPSLOP_SIMILAR_BLOCKS === '1'

    const files = await collectFiles(
      context.rootDirectory,
      context.languages,
      context.config.exclude,
      context.files,
    )

    const targetFiles = files.filter((f) => SUPPORTED_EXTS.has(extname(f)))

    if (targetFiles.length === 0) {
      return {
        engine: this.name,
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: 'No supported files found to scan',
      }
    }

    const allBlocks: CodeBlock[] = []
    const allImports: ImportOccurrence[] = []
    const allStrings: StringOccurrence[] = []
    const allFunctions: FunctionDef[] = []

    for (let batchStart = 0; batchStart < targetFiles.length; batchStart += FILE_BATCH_SIZE) {
      const batch = targetFiles.slice(batchStart, batchStart + FILE_BATCH_SIZE)

      for (const filePath of batch) {
        let content: string
        try {
          content = await readFileContent(filePath)
        } catch {
          continue
        }

        const lines = toLines(content)
        const lang = languageFromPath(filePath)
        const isLargeFile = lines.length > LARGE_FILE_LINE_LIMIT

        if (!isLargeFile) {
          const blocks = extractBlocks(
            lines,
            IDENTICAL_BLOCK_MIN_LINES,
            BLOCK_OVERLAP_STEP,
            filePath,
            lang,
            enableSimilarBlocks,
          )
          allBlocks.push(...blocks)
        }

        const imports = extractImports(content, lang ?? 'typescript')
        for (const imp of imports) {
          const symbols = extractNamedSymbols(imp.raw, lang)
          allImports.push({
            filePath,
            line: imp.line,
            source: imp.source,
            symbols,
          })
        }

        for (const line of lines) {
          const literals = extractStringLiterals(line.text, lang)
          for (const lit of literals) {
            allStrings.push({
              filePath,
              line: line.num,
              col: lit.col,
              value: lit.value,
              raw: lit.raw,
              lineText: line.text,
            })
          }
        }

        const functions = extractFunctions(content, filePath, lang)
        allFunctions.push(...functions)

        content = ''
      }
    }

    diagnostics.push(...detectIdenticalBlocks(allBlocks, context.rootDirectory))

    if (enableSimilarBlocks) {
      const filesWithBlocks = new Set(allBlocks.map((b) => b.filePath))
      if (filesWithBlocks.size >= 2) {
        diagnostics.push(...detectSimilarBlocks(allBlocks, context.rootDirectory))
      }
    }

    diagnostics.push(...detectDuplicateImports(allImports, context.rootDirectory))
    diagnostics.push(...detectRepeatedConstants(allStrings, context.rootDirectory))
    diagnostics.push(...detectCopyPasteFunctions(allFunctions, context.rootDirectory))

    return {
      engine: this.name,
      diagnostics,
      elapsed: performance.now() - start,
      skipped: false,
    }
  },
}
